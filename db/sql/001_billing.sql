-- 001_billing.sql — RECONSTRUIDO el 2026-11-20 a partir de src/db/schema/billing.ts (tablas, claves e
-- índices) y de las definiciones reales de CHECK y triggers extraídas de la base en producción.
-- Los archivos originales 001–003 no estaban en el repositorio; este reemplaza a los tres (incluye lo
-- de pagos y el impuesto por producto). Es el estado de la base ANTES de 004_credit_notes.sql.
-- ⚠ NO EJECUTAR EN PRODUCCIÓN: esa base ya tiene todo esto. Existe para versionar el esquema en el repo y para
-- que los tests de integración (PGlite) tengan sobre qué correr. Producción solo necesita 004_credit_notes.sql.
-- Supone que ya existen organizations, products, stock_movements y auth.users.
begin;

CREATE TABLE "billing_settings" (
	"organization_id" uuid PRIMARY KEY,
	"currency" text DEFAULT 'CLP' NOT NULL,
	"currency_decimals" smallint DEFAULT 0 NOT NULL,
	"locale" text DEFAULT 'es-CL' NOT NULL,
	"timezone" text DEFAULT 'America/Santiago' NOT NULL,
	"tax_name" text DEFAULT 'IVA' NOT NULL,
	"tax_rate" numeric(5,2) DEFAULT '19' NOT NULL,
	"prices_include_tax" boolean DEFAULT true NOT NULL,
	"allow_negative_stock" boolean DEFAULT false NOT NULL,
	"default_due_days" integer DEFAULT 0 NOT NULL,
	"document_prefixes" jsonb DEFAULT '{"invoice":"F","receipt":"R","sales_note":"NV"}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"email" text,
	"phone" text,
	"address" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_organization_id_id_key" UNIQUE("organization_id","id")
);

CREATE TABLE "invoice_counters" (
	"organization_id" uuid,
	"document_type" text,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_pkey" PRIMARY KEY("organization_id","document_type")
);

CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"product_id" uuid,
	"sku" text,
	"description" text NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"quantity" numeric(14,3) NOT NULL,
	"unit_price" numeric(14,2) NOT NULL,
	"discount_type" text DEFAULT 'percent' NOT NULL,
	"discount_value" numeric(14,2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5,2) DEFAULT '0' NOT NULL,
	"tracks_stock" boolean DEFAULT false NOT NULL,
	"line_gross" numeric(14,2) NOT NULL,
	"line_discount" numeric(14,2) NOT NULL,
	"line_net" numeric(14,2) NOT NULL,
	"line_tax" numeric(14,2) NOT NULL,
	"line_total" numeric(14,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_position_key" UNIQUE("organization_id","invoice_id","position")
);

CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text
);

CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"document_type" text DEFAULT 'invoice' NOT NULL,
	"number" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp with time zone,
	"customer_id" uuid,
	"customer_name" text,
	"customer_tax_id" text,
	"customer_email" text,
	"customer_address" text,
	"issuer_legal_name" text,
	"issuer_tax_id" text,
	"issuer_address" text,
	"currency" text NOT NULL,
	"currency_decimals" smallint NOT NULL,
	"tax_name" text NOT NULL,
	"prices_include_tax" boolean NOT NULL,
	"issued_at" timestamp with time zone,
	"due_date" date,
	"subtotal" numeric(14,2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(14,2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14,2) DEFAULT '0' NOT NULL,
	"total" numeric(14,2) DEFAULT '0' NOT NULL,
	"paid_total" numeric(14,2) DEFAULT '0' NOT NULL,
	"notes" text,
	"idempotency_key" uuid,
	"created_by" uuid,
	"issued_by" uuid,
	"voided_by" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_organization_id_id_key" UNIQUE("organization_id","id")
);

CREATE UNIQUE INDEX "customers_org_tax_id_key" ON "customers" ("organization_id","tax_id") WHERE "tax_id" is not null;
CREATE INDEX "customers_org_name_idx" ON "customers" ("organization_id","name");
CREATE INDEX "invoice_items_product_idx" ON "invoice_items" ("organization_id","product_id") WHERE "product_id" is not null;
CREATE INDEX "invoice_payments_invoice_idx" ON "invoice_payments" ("organization_id","invoice_id");
CREATE UNIQUE INDEX "invoices_org_type_number_key" ON "invoices" ("organization_id","document_type","number") WHERE "number" is not null;
CREATE UNIQUE INDEX "invoices_org_idempotency_key" ON "invoices" ("organization_id","idempotency_key") WHERE "idempotency_key" is not null;
CREATE INDEX "invoices_org_created_idx" ON "invoices" ("organization_id","created_at" DESC NULLS LAST);
CREATE INDEX "invoices_org_status_idx" ON "invoices" ("organization_id","status");
CREATE INDEX "invoices_org_customer_idx" ON "invoices" ("organization_id","customer_id");

ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_fkey" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "invoices"("organization_id","id") ON DELETE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_fkey" FOREIGN KEY ("organization_id","product_id") REFERENCES "products"("organization_id","id");
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_voided_by_users_id_fkey" FOREIGN KEY ("voided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_fkey" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "invoices"("organization_id","id") ON DELETE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_users_id_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_users_id_fkey" FOREIGN KEY ("voided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_fkey" FOREIGN KEY ("organization_id","customer_id") REFERENCES "customers"("organization_id","id");

-- ---------- Inventario: lo que facturar necesita de products y stock_movements ----------
alter table public.products add column if not exists tax_rate numeric(5,2);
alter table public.stock_movements add column if not exists reference_type text;
alter table public.stock_movements add column if not exists reference_id uuid;
create index if not exists stock_movements_reference_idx
  on public.stock_movements (organization_id, reference_type, reference_id) where reference_id is not null;
alter table public.products drop constraint if exists products_tax_rate_check;
alter table public.products add constraint products_tax_rate_check check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100));
alter table public.stock_movements drop constraint if exists stock_movements_type_check;
alter table public.stock_movements drop constraint if exists stock_movements_check;
alter table public.stock_movements drop constraint if exists stock_movements_reference_check;
alter table public.stock_movements add constraint stock_movements_type_check
  check (type = any (array['in','out','adjustment','sale','sale_void']));
alter table public.stock_movements add constraint stock_movements_check
  check ((type = 'in' and delta > 0) or (type = 'out' and delta < 0) or (type = 'adjustment' and delta <> 0)
      or (type = 'sale' and delta < 0) or (type = 'sale_void' and delta > 0));
alter table public.stock_movements add constraint stock_movements_reference_check
  check (((reference_type is null) = (reference_id is null)) and (reference_type is null or reference_type = 'invoice'));

-- ---------- CHECK (nombres y definiciones tal como están en la base) ----------
alter table public.billing_settings add constraint billing_settings_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.billing_settings add constraint billing_settings_currency_decimals_check check (currency_decimals >= 0 and currency_decimals <= 2);
alter table public.billing_settings add constraint billing_settings_tax_rate_check check (tax_rate >= 0 and tax_rate <= 100);
alter table public.billing_settings add constraint billing_settings_default_due_days_check check (default_due_days >= 0 and default_due_days <= 365);
alter table public.invoice_counters add constraint invoice_counters_document_type_check check (document_type = any (array['invoice','receipt','sales_note']));
alter table public.invoice_counters add constraint invoice_counters_last_number_check check (last_number >= 0);
alter table public.invoices add constraint invoices_document_type_check check (document_type = any (array['invoice','receipt','sales_note']));
alter table public.invoices add constraint invoices_status_check check (status = any (array['draft','issued','void']));
alter table public.invoices add constraint invoices_payment_status_check check (payment_status = any (array['unpaid','partial','paid']));
alter table public.invoices add constraint invoices_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.invoices add constraint invoices_number_check check (number is null or number > 0);
alter table public.invoices add constraint invoices_draft_number_check check ((status = 'draft') = (number is null));
alter table public.invoices add constraint invoices_issued_at_check check (status = 'draft' or issued_at is not null);
alter table public.invoices add constraint invoices_voided_at_check check ((status = 'void') = (voided_at is not null));
alter table public.invoices add constraint invoices_amounts_check check (subtotal >= 0 and discount_total >= 0 and tax_total >= 0 and total >= 0);
alter table public.invoices add constraint invoices_total_check check (total = subtotal + tax_total);
alter table public.invoices add constraint invoices_paid_total_check check (paid_total >= 0 and paid_total <= total);
alter table public.invoice_items add constraint invoice_items_position_check check (position > 0);
alter table public.invoice_items add constraint invoice_items_quantity_check check (quantity > 0);
alter table public.invoice_items add constraint invoice_items_unit_price_check check (unit_price >= 0);
alter table public.invoice_items add constraint invoice_items_discount_type_check check (discount_type = any (array['percent','amount']));
alter table public.invoice_items add constraint invoice_items_discount_check check (discount_value >= 0 and (discount_type <> 'percent' or discount_value <= 100));
alter table public.invoice_items add constraint invoice_items_tax_rate_check check (tax_rate >= 0 and tax_rate <= 100);
alter table public.invoice_items add constraint invoice_items_tracks_stock_check check (not tracks_stock or product_id is not null);
alter table public.invoice_items add constraint invoice_items_amounts_check check (line_gross >= 0 and line_discount >= 0 and line_net >= 0 and line_tax >= 0 and line_total >= 0);
alter table public.invoice_items add constraint invoice_items_discount_cap_check check (line_discount <= line_gross);
alter table public.invoice_items add constraint invoice_items_total_check check (line_total = line_net + line_tax);
alter table public.invoice_payments add constraint invoice_payments_amount_check check (amount > 0);
alter table public.invoice_payments add constraint invoice_payments_method_check check (method = any (array['cash','transfer','card','other']));
alter table public.invoice_payments add constraint invoice_payments_void_check check ((voided_at is null) = (void_reason is null));

-- ---------- Triggers: documentos emitidos inmutables ----------
create or replace function public.invoice_payments_guard() returns trigger language plpgsql as $function$
declare
  parent_status text;
begin
  if tg_op = 'INSERT' then
    select status into parent_status
    from public.invoices
    where organization_id = new.organization_id and id = new.invoice_id;
    if parent_status is distinct from 'issued' then
      raise exception 'Solo se pueden registrar pagos en documentos emitidos' using errcode = 'check_violation';
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

create or replace function public.invoice_items_guard() returns trigger language plpgsql as $function$
declare
  parent_status text;
begin
  -- Cascada desde invoices (profundidad > 1): el guard del documento ya decidió.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  select status into parent_status
  from public.invoices
  where organization_id = coalesce(new.organization_id, old.organization_id)
    and id = coalesce(new.invoice_id, old.invoice_id);

  if parent_status is not null and parent_status <> 'draft' then
    raise exception 'Las líneas de un documento emitido no se pueden modificar' using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end $function$;

create or replace function public.invoices_guard() returns trigger language plpgsql as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and pg_trigger_depth() = 1 then
      raise exception 'Un documento emitido no se puede eliminar (anúlalo)' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if old.status = 'issued' and new.status not in ('issued', 'void') then
    raise exception 'Transición de estado inválida: % → %', old.status, new.status using errcode = 'check_violation';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'Un documento anulado no se puede reactivar' using errcode = 'check_violation';
  end if;

  if (old.organization_id, old.document_type, old.number, old.issued_at, old.issued_by,
      old.customer_id, old.customer_name, old.customer_tax_id, old.customer_email, old.customer_address,
      old.issuer_legal_name, old.issuer_tax_id, old.issuer_address,
      old.currency, old.currency_decimals, old.tax_name, old.prices_include_tax,
      old.subtotal, old.discount_total, old.tax_total, old.total)
     is distinct from
     (new.organization_id, new.document_type, new.number, new.issued_at, new.issued_by,
      new.customer_id, new.customer_name, new.customer_tax_id, new.customer_email, new.customer_address,
      new.issuer_legal_name, new.issuer_tax_id, new.issuer_address,
      new.currency, new.currency_decimals, new.tax_name, new.prices_include_tax,
      new.subtotal, new.discount_total, new.tax_total, new.total)
  then
    raise exception 'Un documento emitido no se puede modificar' using errcode = 'check_violation';
  end if;

  return new;
end $function$;

drop trigger if exists invoices_guard_trg on public.invoices;
create trigger invoices_guard_trg before delete or update on public.invoices
  for each row execute function public.invoices_guard();
drop trigger if exists invoice_items_guard_trg on public.invoice_items;
create trigger invoice_items_guard_trg before insert or delete or update on public.invoice_items
  for each row execute function public.invoice_items_guard();
drop trigger if exists invoice_payments_guard_trg on public.invoice_payments;
create trigger invoice_payments_guard_trg before insert or delete or update on public.invoice_payments
  for each row execute function public.invoice_payments_guard();

commit;
