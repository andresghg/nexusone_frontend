-- 004_credit_notes.sql — Nota de crédito (documento interno, no tributario).
-- Idempotente y en una sola transacción: se puede volver a correr sin efectos.
--
-- Modelo: una nota de crédito es una fila de `invoices` con document_type = 'credit_note' que apunta
-- (related_invoice_id) a una factura/recibo/nota de venta ya emitida. Sus líneas apuntan a las líneas
-- originales (related_item_id). Al emitirse, la propia base verifica los topes y suma lo acreditado
-- en invoices.credit_total del documento original (nadie más lo escribe), con la fila original
-- bloqueada, así dos notas simultáneas no pueden acreditar más de lo facturado.
--
-- Decisiones: la nota reduce el saldo pendiente (saldo = total − credit_total − paid_total; si ya
-- estaba cobrado queda saldo a favor y el reembolso es manual). Una nota emitida NO se anula, y un
-- documento con notas emitidas NO se puede anular.
begin;

-- ---------- 1. Columnas ----------
alter table public.invoices
  add column if not exists related_invoice_id uuid,
  add column if not exists credit_reason text,
  add column if not exists credit_total numeric(14,2) not null default 0;

alter table public.invoice_items
  add column if not exists related_item_id uuid,
  add column if not exists restock boolean not null default false;

-- ---------- 2. Claves (se sueltan primero para poder repetir el script) ----------
alter table public.invoices drop constraint if exists invoices_related_invoice_fkey;
alter table public.invoice_items drop constraint if exists invoice_items_related_item_fkey;
alter table public.invoice_items drop constraint if exists invoice_items_organization_id_id_key;

alter table public.invoice_items
  add constraint invoice_items_organization_id_id_key unique (organization_id, id);
alter table public.invoices
  add constraint invoices_related_invoice_fkey
  foreign key (organization_id, related_invoice_id) references public.invoices (organization_id, id);
alter table public.invoice_items
  add constraint invoice_items_related_item_fkey
  foreign key (organization_id, related_item_id) references public.invoice_items (organization_id, id);

create index if not exists invoices_related_invoice_idx
  on public.invoices (organization_id, related_invoice_id) where related_invoice_id is not null;
create index if not exists invoice_items_related_item_idx
  on public.invoice_items (organization_id, related_item_id) where related_item_id is not null;

-- ---------- 3. CHECK ----------
alter table public.invoices drop constraint if exists invoices_document_type_check;
alter table public.invoices add constraint invoices_document_type_check
  check (document_type = any (array['invoice','receipt','sales_note','credit_note']));
alter table public.invoice_counters drop constraint if exists invoice_counters_document_type_check;
alter table public.invoice_counters add constraint invoice_counters_document_type_check
  check (document_type = any (array['invoice','receipt','sales_note','credit_note']));

alter table public.invoices drop constraint if exists invoices_credit_note_check;
alter table public.invoices add constraint invoices_credit_note_check
  check ((document_type = 'credit_note') = (related_invoice_id is not null));
alter table public.invoices drop constraint if exists invoices_credit_reason_check;
alter table public.invoices add constraint invoices_credit_reason_check
  check (document_type <> 'credit_note' or length(btrim(coalesce(credit_reason, ''))) > 0);
alter table public.invoices drop constraint if exists invoices_credit_total_check;
alter table public.invoices add constraint invoices_credit_total_check
  check (credit_total >= 0 and credit_total <= total and (document_type <> 'credit_note' or credit_total = 0));
alter table public.invoice_items drop constraint if exists invoice_items_restock_check;
alter table public.invoice_items add constraint invoice_items_restock_check
  check (not restock or tracks_stock);

alter table public.stock_movements drop constraint if exists stock_movements_type_check;
alter table public.stock_movements add constraint stock_movements_type_check
  check (type = any (array['in','out','adjustment','sale','sale_void','credit_note']));
alter table public.stock_movements drop constraint if exists stock_movements_check;
alter table public.stock_movements add constraint stock_movements_check
  check ((type = 'in' and delta > 0) or (type = 'out' and delta < 0) or (type = 'adjustment' and delta <> 0)
      or (type = 'sale' and delta < 0) or (type = 'sale_void' and delta > 0) or (type = 'credit_note' and delta > 0));

-- ---------- 4. Prefijo de numeración ----------
alter table public.billing_settings alter column document_prefixes
  set default '{"invoice":"F","receipt":"R","sales_note":"NV","credit_note":"NC"}'::jsonb;
update public.billing_settings
   set document_prefixes = document_prefixes || '{"credit_note":"NC"}'::jsonb
 where not (document_prefixes ? 'credit_note');

-- ---------- 5. Triggers ----------
-- Pagos: una nota de crédito no recibe cobros (el dinero se maneja en el documento original).
create or replace function public.invoice_payments_guard() returns trigger language plpgsql as $function$
declare
  parent_status text;
  parent_type text;
begin
  if tg_op = 'INSERT' then
    select status, document_type into parent_status, parent_type
    from public.invoices
    where organization_id = new.organization_id and id = new.invoice_id;
    if parent_status is distinct from 'issued' then
      raise exception 'Solo se pueden registrar pagos en documentos emitidos' using errcode = 'check_violation';
    end if;
    if parent_type = 'credit_note' then
      raise exception 'Una nota de crédito no recibe pagos' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      raise exception 'Un pago no se puede eliminar (anúlalo)' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.voided_at is not null then
    raise exception 'El pago ya está anulado' using errcode = 'check_violation';
  end if;
  if (old.organization_id, old.invoice_id, old.amount, old.method, old.reference, old.paid_at, old.created_by, old.created_at)
     is distinct from
     (new.organization_id, new.invoice_id, new.amount, new.method, new.reference, new.paid_at, new.created_by, new.created_at)
  then
    raise exception 'Un pago no se puede modificar (solo anular)' using errcode = 'check_violation';
  end if;
  return new;
end $function$;

-- Documentos: mismas reglas de siempre + reglas de la nota de crédito.
create or replace function public.invoices_guard() returns trigger language plpgsql as $function$
declare
  rel record;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and pg_trigger_depth() = 1 then
      raise exception 'Un documento emitido no se puede eliminar (anúlalo)' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    -- Borrador → emitida: una nota de crédito se valida contra su documento original.
    if new.status = 'issued' and new.document_type = 'credit_note' then
      -- Bloquea el original: dos notas simultáneas se serializan aquí.
      select id, status, document_type, currency, total, credit_total into rel
      from public.invoices
      where organization_id = new.organization_id and id = new.related_invoice_id
      for update;

      if not found or rel.status <> 'issued' or rel.document_type = 'credit_note' then
        raise exception 'Solo se puede emitir una nota de crédito sobre un documento emitido' using errcode = 'check_violation';
      end if;
      if rel.currency <> new.currency then
        raise exception 'La nota de crédito debe estar en la moneda del documento original' using errcode = 'check_violation';
      end if;
      if not exists (select 1 from public.invoice_items where organization_id = new.organization_id and invoice_id = new.id) then
        raise exception 'La nota de crédito no tiene líneas' using errcode = 'check_violation';
      end if;
      -- El encabezado debe ser la suma exacta de sus líneas (la base no confía en lo que mande el servidor).
      if exists (
        select 1
        from (
          select coalesce(sum(line_net), 0) as net, coalesce(sum(line_tax), 0) as tax, coalesce(sum(line_total), 0) as tot
          from public.invoice_items where organization_id = new.organization_id and invoice_id = new.id
        ) s
        where s.net <> new.subtotal or s.tax <> new.tax_total or s.tot <> new.total
      ) then
        raise exception 'Los totales de la nota no coinciden con la suma de sus líneas' using errcode = 'check_violation';
      end if;
      if exists (
        select 1
        from public.invoice_items n
        left join public.invoice_items o
          on o.organization_id = n.organization_id and o.id = n.related_item_id and o.invoice_id = new.related_invoice_id
        where n.organization_id = new.organization_id and n.invoice_id = new.id and o.id is null
      ) then
        raise exception 'Cada línea de la nota debe corresponder a una línea del documento original' using errcode = 'check_violation';
      end if;
      -- Tope por línea (cantidad y monto): notas ya emitidas + esta.
      if exists (
        select 1
        from public.invoice_items o
        join (
          select n.related_item_id, sum(n.quantity) as q, sum(n.line_total) as t
          from public.invoice_items n
          join public.invoices i on i.organization_id = n.organization_id and i.id = n.invoice_id
          where n.organization_id = new.organization_id
            and i.related_invoice_id = new.related_invoice_id
            and (i.id = new.id or i.status = 'issued')
          group by n.related_item_id
        ) c on c.related_item_id = o.id
        where o.organization_id = new.organization_id and o.invoice_id = new.related_invoice_id
          and (c.q > o.quantity or c.t > o.line_total)
      ) then
        raise exception 'Se acredita más de lo facturado en una línea' using errcode = 'check_violation';
      end if;
      if rel.credit_total + new.total > rel.total then
        raise exception 'Se acredita más que el total del documento' using errcode = 'check_violation';
      end if;

      update public.invoices
         set credit_total = credit_total + new.total
       where organization_id = new.organization_id and id = new.related_invoice_id;
    end if;
    return new;
  end if;

  if old.status = 'issued' and new.status not in ('issued', 'void') then
    raise exception 'Transición de estado inválida: % → %', old.status, new.status using errcode = 'check_violation';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'Un documento anulado no se puede reactivar' using errcode = 'check_violation';
  end if;

  if old.status = 'issued' and new.status = 'void' then
    if old.document_type = 'credit_note' then
      raise exception 'Una nota de crédito emitida no se puede anular' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.invoices
      where organization_id = old.organization_id and related_invoice_id = old.id and status = 'issued'
    ) then
      raise exception 'El documento tiene notas de crédito emitidas: no se puede anular' using errcode = 'check_violation';
    end if;
  end if;

  if (old.organization_id, old.document_type, old.number, old.issued_at, old.issued_by,
      old.customer_id, old.customer_name, old.customer_tax_id, old.customer_email, old.customer_address,
      old.issuer_legal_name, old.issuer_tax_id, old.issuer_address,
      old.currency, old.currency_decimals, old.tax_name, old.prices_include_tax,
      old.subtotal, old.discount_total, old.tax_total, old.total,
      old.related_invoice_id, old.credit_reason)
     is distinct from
     (new.organization_id, new.document_type, new.number, new.issued_at, new.issued_by,
      new.customer_id, new.customer_name, new.customer_tax_id, new.customer_email, new.customer_address,
      new.issuer_legal_name, new.issuer_tax_id, new.issuer_address,
      new.currency, new.currency_decimals, new.tax_name, new.prices_include_tax,
      new.subtotal, new.discount_total, new.tax_total, new.total,
      new.related_invoice_id, new.credit_reason)
  then
    raise exception 'Un documento emitido no se puede modificar' using errcode = 'check_violation';
  end if;

  -- credit_total solo lo mueve la emisión de una nota (arriba, a mano con el original bloqueado).
  if new.credit_total is distinct from old.credit_total and pg_trigger_depth() = 1 then
    raise exception 'El total acreditado solo cambia al emitir una nota de crédito' using errcode = 'check_violation';
  end if;

  return new;
end $function$;

commit;
