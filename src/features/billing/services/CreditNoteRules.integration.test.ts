// Reglas de la nota de crédito en la base (db/sql/004_credit_notes.sql), contra Postgres real (PGlite).
// Se saltan solas si @electric-sql/pglite no está instalado.
// Limitación: PGlite tiene una sola conexión; la carrera real entre dos notas simultáneas (el FOR UPDATE
// del original dentro del trigger) hay que probarla en el entorno real (ver la lista de comprobación).
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

type Pg = {
  query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>
  exec: (text: string) => Promise<unknown>
}

const pgliteName = '@electric-sql/pglite'
const pgliteModule = (await import(/* @vite-ignore */ pgliteName).catch(() => null)) as { PGlite: new () => Pg } | null
const hasPglite = pgliteModule !== null

const sqlFiles = hasPglite
  ? readdirSync(resolve(process.cwd(), 'db/sql'))
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .map((n) => readFileSync(resolve(process.cwd(), 'db/sql', n), 'utf8'))
  : []

let pg: Pg
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows
const fails = (text: string, params: unknown[] = []) => expect(q(text, params)).rejects.toThrow()

const PRELUDE = `
  create schema auth; create table auth.users (id uuid primary key default gen_random_uuid());
  create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, owner_user_id uuid,
    legal_name text, tax_id text, business_activity text, address text, commune text, region text, phone text, contact_email text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table public.products (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
    category_id uuid, sku text not null, barcode text, name text not null, description text, unit text not null default 'un',
    price numeric(14,2) not null default 0, cost numeric(14,2) not null default 0, min_stock numeric(14,3) not null default 0,
    track_stock boolean not null default true, active boolean not null default true,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (organization_id, id), unique (organization_id, sku));
  create table public.stock_movements (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
    product_id uuid not null, type text not null check (type in ('in','out','adjustment')), delta numeric(14,3) not null, reason text, created_by uuid,
    created_at timestamptz not null default now(),
    foreign key (organization_id, product_id) references public.products(organization_id, id),
    check (((type = 'in' and delta > 0) or (type = 'out' and delta < 0) or (type = 'adjustment' and delta <> 0))));`

let org = ''
let counter = 0
// Documento emitido con una línea: 10 unidades a 1.190 (total 11.900 = neto 10.000 + IVA 1.900).
const issuedDoc = async (type: 'invoice' | 'receipt' = 'invoice') => {
  const inv = (
    await q<{ id: string }>(
      `insert into invoices(organization_id, document_type, currency, currency_decimals, tax_name, prices_include_tax, subtotal, tax_total, total)
       values ($1,$2,'CLP',0,'IVA',true,10000,1900,11900) returning id`,
      [org, type],
    )
  )[0].id
  const item = (
    await q<{ id: string }>(
      `insert into invoice_items(organization_id, invoice_id, position, description, quantity, unit_price, line_gross, line_discount, line_net, line_tax, line_total, tax_rate)
       values ($1,$2,1,'Cola',10,1190,11900,0,10000,1900,11900,19) returning id`,
      [org, inv],
    )
  )[0].id
  await q(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [inv, ++counter])
  return { inv, item }
}
// Nota de crédito en borrador; el total sale de las líneas dadas (cantidad, total de línea).
const draftNote = async (related: string, lines: { item: string | null; qty: number; total: number }[], reason: string | null = 'Devolución') => {
  const total = lines.reduce((a, l) => a + l.total, 0)
  const net = Math.round(total / 1.19)
  const note = (
    await q<{ id: string }>(
      `insert into invoices(organization_id, document_type, related_invoice_id, credit_reason, currency, currency_decimals, tax_name, prices_include_tax, subtotal, tax_total, total)
       values ($1,'credit_note',$2,$3,'CLP',0,'IVA',true,$4,$5,$6) returning id`,
      [org, related, reason, net, total - net, total],
    )
  )[0].id
  for (const [i, l] of lines.entries()) {
    const lineNet = Math.round(l.total / 1.19)
    await q(
      `insert into invoice_items(organization_id, invoice_id, position, description, quantity, unit_price, line_gross, line_discount, line_net, line_tax, line_total, tax_rate, related_item_id)
       values ($1,$2,$3,'Cola',$4,1190,$5,0,$6,$7,$5,19,$8)`,
      [org, note, i + 1, l.qty, l.total, lineNet, l.total - lineNet, l.item],
    )
  }
  return note
}
const issueNote = (note: string) => q(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [note, ++counter])
const creditTotal = async (inv: string) => Number((await q<{ c: string }>(`select credit_total c from invoices where id=$1`, [inv]))[0].c)

describe.skipIf(!hasPglite)('Nota de crédito en la base', () => {
  beforeAll(async () => {
    const client = new pgliteModule!.PGlite()
    await client.exec(PRELUDE)
    for (const file of sqlFiles) await client.exec(file)
    pg = client
    org = (await q<{ id: string }>(`insert into organizations(name, slug) values ('Org','o1') returning id`))[0].id
  })

  it('el script 004 se puede volver a correr sin errores', async () => {
    await pg.exec(sqlFiles[sqlFiles.length - 1])
    await pg.exec(sqlFiles[sqlFiles.length - 1])
  })

  it('emitir una nota parcial suma lo acreditado al documento original', async () => {
    const { inv, item } = await issuedDoc()
    const note = await draftNote(inv, [{ item, qty: 4, total: 4760 }])
    await issueNote(note)
    expect(await creditTotal(inv)).toBe(4760)
    const [n] = await q<Record<string, unknown>>(`select status, document_type, credit_total from invoices where id=$1`, [note])
    expect(n).toMatchObject({ status: 'issued', document_type: 'credit_note', credit_total: '0.00' })
  })

  it('varias notas se acumulan y el tope por línea se aplica a la suma', async () => {
    const { inv, item } = await issuedDoc()
    await issueNote(await draftNote(inv, [{ item, qty: 6, total: 7140 }]))
    await issueNote(await draftNote(inv, [{ item, qty: 4, total: 4760 }]))
    expect(await creditTotal(inv)).toBe(11900)
    const extra = await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [extra, ++counter])
    expect(await creditTotal(inv)).toBe(11900)
  })

  it('rechaza acreditar más cantidad o más monto que lo facturado en la línea', async () => {
    const { inv, item } = await issuedDoc()
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [await draftNote(inv, [{ item, qty: 11, total: 11900 }]), ++counter])
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [await draftNote(inv, [{ item, qty: 10, total: 11901 }]), ++counter])
    expect(await creditTotal(inv)).toBe(0)
  })

  it('una misma línea repetida en la nota también cuenta junta', async () => {
    const { inv, item } = await issuedDoc()
    const note = await draftNote(inv, [{ item, qty: 6, total: 7140 }, { item, qty: 6, total: 7140 }])
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [note, ++counter])
  })

  it('solo se emite sobre un documento emitido y que no sea otra nota', async () => {
    const draft = (await q<{ id: string }>(
      `insert into invoices(organization_id, currency, currency_decimals, tax_name, prices_include_tax, subtotal, tax_total, total) values ($1,'CLP',0,'IVA',true,10000,1900,11900) returning id`, [org]))[0].id
    const draftItem = (await q<{ id: string }>(
      `insert into invoice_items(organization_id, invoice_id, position, description, quantity, unit_price, line_gross, line_discount, line_net, line_tax, line_total, tax_rate)
       values ($1,$2,1,'Cola',10,1190,11900,0,10000,1900,11900,19) returning id`, [org, draft]))[0].id
    const noteOnDraft = await draftNote(draft, [{ item: draftItem, qty: 1, total: 1190 }]) // el borrador se puede crear...
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [noteOnDraft, ++counter]) // ...pero no emitir

    const { inv, item } = await issuedDoc()
    const note = await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await issueNote(note)
    const [noteItem] = await q<{ id: string }>(`select id from invoice_items where invoice_id=$1`, [note])
    const onNote = await draftNote(note, [{ item: noteItem.id, qty: 1, total: 1190 }])
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [onNote, ++counter])
  })

  it('cada línea debe ser del documento original; sin líneas no se emite; exige motivo', async () => {
    const a = await issuedDoc()
    const b = await issuedDoc()
    const wrong = await draftNote(a.inv, [{ item: b.item, qty: 1, total: 1190 }])
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [wrong, ++counter])
    const empty = await draftNote(a.inv, [])
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [empty, ++counter])
    await fails(`insert into invoices(organization_id, document_type, related_invoice_id, credit_reason, currency, currency_decimals, tax_name, prices_include_tax)
      values ($1,'credit_note',$2,'  ','CLP',0,'IVA',true)`, [org, a.inv])
    await fails(`insert into invoices(organization_id, document_type, currency, currency_decimals, tax_name, prices_include_tax, credit_reason)
      values ($1,'credit_note','CLP',0,'IVA',true,'x')`, [org]) // sin documento relacionado
  })

  it('el total de la nota debe ser la suma de sus líneas', async () => {
    const { inv, item } = await issuedDoc()
    const note = await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await q(`update invoices set subtotal = subtotal + 1000, total = total + 1000 where id=$1`, [note]) // encabezado inflado
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [note, ++counter])
    expect(await creditTotal(inv)).toBe(0)
  })

  it('no se puede acreditar un documento anulado', async () => {
    const { inv, item } = await issuedDoc()
    await q(`update invoices set status='void', voided_at=now(), void_reason='x' where id=$1`, [inv])
    const note = await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await fails(`update invoices set status='issued', number=$2, issued_at=now() where id=$1`, [note, ++counter])
  })

  it('un documento con notas emitidas no se anula, y una nota emitida tampoco', async () => {
    const { inv, item } = await issuedDoc()
    const note = await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await issueNote(note)
    await fails(`update invoices set status='void', voided_at=now(), void_reason='x' where id=$1`, [inv])
    await fails(`update invoices set status='void', voided_at=now(), void_reason='x' where id=$1`, [note])
  })

  it('un borrador de nota sin emitir no impide anular el original', async () => {
    const { inv, item } = await issuedDoc()
    await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await q(`update invoices set status='void', voided_at=now(), void_reason='x' where id=$1`, [inv])
  })

  it('credit_total no se puede tocar a mano; la nota emitida es inmutable', async () => {
    const { inv, item } = await issuedDoc()
    await fails(`update invoices set credit_total = 100 where id=$1`, [inv])
    const note = await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await issueNote(note)
    await fails(`update invoices set credit_total = 0 where id=$1`, [inv])
    await fails(`update invoices set related_invoice_id = null where id=$1`, [note])
    await fails(`update invoices set credit_reason = 'otro' where id=$1`, [note])
    await fails(`update invoices set total = 1 where id=$1`, [note])
    await fails(`update invoice_items set quantity = 2 where invoice_id=$1`, [note])
    await fails(`delete from invoices where id=$1`, [note])
  })

  it('una nota de crédito no recibe cobros', async () => {
    const { inv, item } = await issuedDoc()
    const note = await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await issueNote(note)
    await fails(`insert into invoice_payments(organization_id, invoice_id, amount, method) values ($1,$2,100,'cash')`, [org, note])
    await q(`insert into invoice_payments(organization_id, invoice_id, amount, method) values ($1,$2,100,'cash')`, [org, inv]) // el original sí
  })

  it('el movimiento de stock credit_note debe sumar y referenciar el documento', async () => {
    const { inv } = await issuedDoc()
    const product = (await q<{ id: string }>(`insert into products(organization_id, sku, name) values ($1,'S1','Cola') returning id`, [org]))[0].id
    const ins = (delta: number, type = 'credit_note') =>
      q(`insert into stock_movements(organization_id, product_id, type, delta, reference_type, reference_id) values ($1,$2,$3,$4,'invoice',$5)`, [org, product, type, delta, inv])
    await ins(2)
    await fails(`insert into stock_movements(organization_id, product_id, type, delta) values ($1,$2,'credit_note',-2)`, [org, product])
    await expect(ins(-2)).rejects.toThrow()
    await ins(-1, 'sale') // lo anterior sigue funcionando
  })

  it('línea con restock exige que controle stock', async () => {
    const { inv, item } = await issuedDoc()
    const note = await draftNote(inv, [{ item, qty: 1, total: 1190 }])
    await fails(`update invoice_items set restock = true where invoice_id=$1`, [note]) // la línea no controla stock
  })

  it('el prefijo NC queda por defecto y se agrega a las empresas existentes', async () => {
    const o = (await q<{ id: string }>(`insert into organizations(name, slug) values ('Org2','o2') returning id`))[0].id
    await q(`insert into billing_settings(organization_id) values ($1)`, [o])
    const [row] = await q<{ p: Record<string, string> }>(`select document_prefixes p from billing_settings where organization_id=$1`, [o])
    expect(row.p).toEqual({ invoice: 'F', receipt: 'R', sales_note: 'NV', credit_note: 'NC' })
  })
})
