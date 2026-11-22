// Nota de crédito de punta a punta contra Postgres real (PGlite): servicio + repositorio + SQL 001/004.
// Se salta sola si @electric-sql/pglite no está instalado. Limitación: una sola conexión, así que el bloqueo
// FOR UPDATE entre dos emisiones simultáneas se prueba en el entorno real (ver la lista de comprobación).
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

type Pg = {
  query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>
  exec: (text: string) => Promise<unknown>
}

const holder = vi.hoisted(() => ({ db: null as unknown, pg: null as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return holder.db
  },
}))

const pgliteName = '@electric-sql/pglite'
const pgliteModule = (await import(/* @vite-ignore */ pgliteName).catch(() => null)) as { PGlite: new () => Pg } | null
const hasPglite = pgliteModule !== null

import { customerRepository } from '@/features/customers/services/CustomerRepository'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '../types/billing'
import type { IssueCreditNoteInput, IssueInvoiceInput } from '../schemas/invoiceSchema'
import { invoiceRepository } from './InvoiceRepository'
import { InvoiceService } from './InvoiceService'

const sqlFile = hasPglite
  ? readdirSync(resolve(process.cwd(), 'db/sql')).filter((n) => n.endsWith('.sql')).sort().map((name) => readFileSync(resolve(process.cwd(), 'db/sql', name), 'utf8')).join('\n')
  : ''
const pg = () => holder.pg as Pg
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg().query<T>(text, params)).rows

let userId = ''
const settings: BillingSettings = structuredClone(DEFAULT_BILLING_SETTINGS)
const clock = new Date('2026-11-10T15:00:00Z')

const ALL = ['pos.facturacion.read', 'pos.facturacion.create', 'pos.facturacion.void', 'pos.facturacion.adjust']
const accessWith = (permissions: string[]) => ({
  authorize: async (_u: string, org: string, permission: string) =>
    permissions.includes(permission) ? ({ organizationId: org, role: 'admin', permissions } as never) : null,
})
const settingsRepo = { find: async () => settings, save: async () => {} }
const service = (permissions = ALL) =>
  new InvoiceService(invoiceRepository, settingsRepo, customerRepository, accessWith(permissions), () => clock)

const newOrg = async () =>
  (await q<{ id: string }>(
    `insert into organizations(name, slug, legal_name, tax_id, address) values ('Org', $1, 'Acme SpA', '76.000.000-1', 'Calle 1') returning id`,
    [`s-${Math.random().toString(36).slice(2)}`],
  ))[0].id

const newProduct = async (org: string, o: { price?: number; stock?: number; track?: boolean; name?: string } = {}) => {
  const id = (await q<{ id: string }>(
    `insert into products(organization_id, sku, name, unit, price, track_stock) values ($1,$2,$3,'un',$4,$5) returning id`,
    [org, `SKU-${Math.random().toString(36).slice(2, 8)}`, o.name ?? 'Cola 1L', o.price ?? 1190, o.track ?? true],
  ))[0].id
  if ((o.track ?? true) && o.stock) {
    await q(`insert into stock_movements(organization_id, product_id, type, delta) values ($1,$2,'in',$3)`, [org, id, o.stock])
  }
  return id
}
const stockOf = async (org: string, product: string) =>
  Number((await q<{ s: string }>(`select coalesce(sum(delta),0) s from stock_movements where organization_id=$1 and product_id=$2`, [org, product]))[0].s)

const line = (productId: string, quantity = 1, over = {}) => ({
  productId, description: '', unit: '', quantity, unitPrice: 0, discountType: 'percent' as const, discountValue: 0, taxRate: null, ...over,
})
const issueInvoice = async (org: string, lines: IssueInvoiceInput['lines'], over: Partial<IssueInvoiceInput> = {}) => {
  const result = await service().issue(userId, org, {
    documentType: 'invoice', customerId: null, dueDate: null, notes: '', paid: false, idempotencyKey: crypto.randomUUID(), lines, ...over,
  })
  expect(result.error).toBe('')
  return result.invoice!.id
}
const itemsOf = async (invoiceId: string) =>
  q<{ id: string; position: number }>(`select id, position from invoice_items where invoice_id=$1 order by position`, [invoiceId])

const credit = async (
  org: string,
  invoiceId: string,
  lines: { itemId: string; quantity: number; restock?: boolean }[],
  over: Partial<IssueCreditNoteInput> = {},
  permissions = ALL,
) =>
  service(permissions).issueCreditNote(userId, org, {
    invoiceId, reason: 'Devolución del cliente', idempotencyKey: crypto.randomUUID(),
    lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, restock: l.restock ?? true })), ...over,
  })

const page = (
  org: string,
  payment: 'all' | 'unpaid' | 'paid',
  extra: { search?: string; documentType?: 'all' | 'invoice' | 'credit_note'; documentPrefixes?: BillingSettings['documentPrefixes'] } = {},
) =>
  invoiceRepository.findPage(
    org,
    {
      payment,
      timezone: 'America/Santiago',
      today: '2026-11-10',
      search: extra.search,
      documentType: extra.documentType,
      documentPrefixes: extra.documentPrefixes ?? settings.documentPrefixes,
    },
    { page: 1, pageSize: 20 },
  )
const invoiceRow = async (id: string) => (await q<Record<string, unknown>>(`select * from invoices where id=$1`, [id]))[0]
const noteCounter = async (org: string) =>
  (await q<{ n: number }>(`select last_number n from invoice_counters where organization_id=$1 and document_type='credit_note'`, [org]))[0]?.n ?? 0

describe.skipIf(!hasPglite)('Nota de crédito contra Postgres real', () => {
  beforeAll(async () => {
    const { PGlite } = pgliteModule!
    const { drizzle } = await import('drizzle-orm/pglite')
    const client = new PGlite()
    await client.exec(`
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
        check (((type = 'in' and delta > 0) or (type = 'out' and delta < 0) or (type = 'adjustment' and delta <> 0))));`)
    await client.exec(sqlFile)
    userId = (await client.query<{ id: string }>(`insert into auth.users default values returning id`)).rows[0].id
    holder.pg = client
    holder.db = drizzle({ client: client as never })
  })

  describe('emitir', () => {
    it('acredita parte del documento, devuelve stock y deja el saldo del original', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)]) // 2.380, stock 8
      const [item] = await itemsOf(inv)

      const result = await credit(org, inv, [{ itemId: item.id, quantity: 1 }])
      expect(result.error).toBe('')
      expect(result.success).toContain('Nota de crédito emitida: NC-000001.')
      expect(result.success).toContain('Saldo pendiente del documento')

      const original = await invoiceRow(inv)
      expect(original).toMatchObject({ credit_total: '1190.00', payment_status: 'unpaid', paid_total: '0.00', status: 'issued' })

      const [note] = await q<Record<string, unknown>>(`select * from invoices where related_invoice_id=$1`, [inv])
      expect(note).toMatchObject({
        document_type: 'credit_note', status: 'issued', number: 1, payment_status: 'paid', paid_total: '0.00', credit_reason: 'Devolución del cliente',
        subtotal: '1000.00', tax_total: '190.00', total: '1190.00', issuer_legal_name: 'Acme SpA', created_by: userId, issued_by: userId, due_date: null,
      })
      const [noteItem] = await q<Record<string, unknown>>(`select * from invoice_items where invoice_id=$1`, [note.id])
      expect(noteItem).toMatchObject({
        related_item_id: item.id, quantity: '1.000', unit_price: '1190.00', tax_rate: '19.00', restock: true,
        line_gross: '1190.00', line_net: '1000.00', line_tax: '190.00', line_total: '1190.00',
      })

      // Cliente, emisor y moneda se copian del documento original, no se leen de nuevo
      const cols = 'customer_id, customer_name, customer_tax_id, customer_email, customer_address, issuer_legal_name, issuer_tax_id, issuer_address, currency, currency_decimals, tax_name, prices_include_tax'
      const pick = async (id: string) => (await q<Record<string, unknown>>(`select ${cols} from invoices where id=$1`, [id]))[0]
      expect(await pick(note.id as string)).toEqual(await pick(inv))
      expect(await stockOf(org, cola)).toBe(9)
      const [mv] = await q<Record<string, unknown>>(`select * from stock_movements where type='credit_note' and organization_id=$1`, [org])
      expect(mv).toMatchObject({
        product_id: cola, delta: '1.000', reference_type: 'invoice', reference_id: note.id, created_by: userId,
        reason: 'Nota de crédito NC-000001 (Factura F-000001)',
      })
    })

    it('sin "devolver al stock" no se mueve el inventario; los servicios sin control de stock nunca lo mueven', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const servicio = await newProduct(org, { track: false, name: 'Flete' })
      const inv = await issueInvoice(org, [line(cola, 2), line(servicio, 1)])
      const [a, b] = await itemsOf(inv)

      expect((await credit(org, inv, [{ itemId: a.id, quantity: 1, restock: false }, { itemId: b.id, quantity: 1, restock: true }])).error).toBe('')
      expect(await stockOf(org, cola)).toBe(8)
      expect((await q(`select 1 from stock_movements where type='credit_note' and organization_id=$1`, [org])).length).toBe(0)
      const items = await q<{ restock: boolean; tracks_stock: boolean }>(`select restock, tracks_stock from invoice_items where invoice_id in (select id from invoices where related_invoice_id=$1) order by position`, [inv])
      expect(items).toEqual([{ restock: false, tracks_stock: true }, { restock: false, tracks_stock: false }])
    })

    it('usa los montos de la línea original (descuento incluido) y las notas suman exactamente el original', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { price: 11900, stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 3, { discountType: 'percent', discountValue: 10 })]) // 32.130
      const [item] = await itemsOf(inv)
      const original = await invoiceRow(inv)

      for (const qty of [1, 1, 1]) expect((await credit(org, inv, [{ itemId: item.id, quantity: qty }])).error).toBe('')
      const totals = await q<{ total: string }>(`select total from invoices where related_invoice_id=$1 order by number`, [inv])
      expect(totals.map((t) => Number(t.total)).reduce((a, b) => a + b, 0)).toBe(Number(original.total))
      expect((await invoiceRow(inv)).credit_total).toBe(original.total)
      // ya no queda nada por acreditar
      expect((await credit(org, inv, [{ itemId: item.id, quantity: 1 }])).error).toBe('Línea 1: ya está acreditada por completo')
    })

    it('no deja acreditar más de lo que queda y no guarda nada ni consume número', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)

      expect((await credit(org, inv, [{ itemId: item.id, quantity: 3 }])).error).toBe('Línea 1: solo quedan 2 por acreditar')
      expect(await noteCounter(org)).toBe(0)
      expect((await q(`select 1 from invoices where related_invoice_id=$1`, [inv])).length).toBe(0)
      expect((await credit(org, inv, [{ itemId: item.id, quantity: 1 }])).success).toContain('NC-000001')
      expect((await credit(org, inv, [{ itemId: item.id, quantity: 1.5 }])).error).toBe('Línea 1: solo quedan 1 por acreditar')
      expect(await noteCounter(org)).toBe(1) // el rechazo no saltó el número
    })

    it('es idempotente: la misma clave devuelve la nota ya emitida, no crea otra', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)
      const key = crypto.randomUUID()

      const first = await credit(org, inv, [{ itemId: item.id, quantity: 1 }], { idempotencyKey: key })
      const second = await credit(org, inv, [{ itemId: item.id, quantity: 1 }], { idempotencyKey: key })
      expect(second.creditNote?.id).toBe(first.creditNote?.id)
      expect((await q(`select 1 from invoices where related_invoice_id=$1`, [inv])).length).toBe(1)
      expect((await invoiceRow(inv)).credit_total).toBe('1190.00')
      expect(await stockOf(org, cola)).toBe(9)
    })

    it('rechaza línea ajena, nota sobre nota, documento anulado y documento inexistente', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 20 })
      const a = await issueInvoice(org, [line(cola, 1)])
      const b = await issueInvoice(org, [line(cola, 1)])
      const [itemA] = await itemsOf(a)
      const [itemB] = await itemsOf(b)

      expect((await credit(org, a, [{ itemId: itemB.id, quantity: 1 }])).error).toBe('Línea 1: no pertenece al documento')

      const noted = await credit(org, a, [{ itemId: itemA.id, quantity: 1 }])
      const [noteItem] = await itemsOf(noted.creditNote!.id)
      expect((await credit(org, noted.creditNote!.id, [{ itemId: noteItem.id, quantity: 1 }])).error).toBe('No se puede acreditar una nota de crédito')

      await service().voidInvoice(userId, org, { invoiceId: b, reason: 'Error de digitación' })
      expect((await credit(org, b, [{ itemId: itemB.id, quantity: 1 }])).error).toBe('El documento está anulado')
      expect((await credit(org, crypto.randomUUID(), [{ itemId: itemB.id, quantity: 1 }])).error).toBe('El documento no existe')
    })

    it('el repositorio también rechaza una línea repetida (sin pasar por el servicio)', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 4)])
      const [item] = await itemsOf(inv)
      const outcome = await invoiceRepository.issueCreditNote(org, {
        userId, invoiceId: inv, idempotencyKey: crypto.randomUUID(), reason: 'Prueba', documentPrefixes: settings.documentPrefixes, issuedAt: clock,
        lines: [{ itemId: item.id, quantity: 1, restock: true }, { itemId: item.id, quantity: 1, restock: true }],
      })
      expect(outcome).toEqual({ status: 'invalid', message: 'Línea 2: ya está incluida en la nota' })
      expect(await noteCounter(org)).toBe(0)
    })

    it('exige permiso de anulación y valida la entrada', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 5 })
      const inv = await issueInvoice(org, [line(cola, 1)])
      const [item] = await itemsOf(inv)
      expect((await credit(org, inv, [{ itemId: item.id, quantity: 1 }], {}, ['pos.facturacion.create'])).error).toBe('No tienes permisos para emitir notas de crédito')
      expect((await credit(org, inv, [{ itemId: item.id, quantity: 1 }], { reason: 'x' })).error).toBe('Indica el motivo de la nota de crédito')
      expect((await credit(org, inv, [{ itemId: item.id, quantity: 1 }, { itemId: item.id, quantity: 1 }])).error).toBe('Una línea no puede repetirse en la nota')
      expect((await credit(org, inv, [])).error).toBe('Elige al menos una línea para acreditar')
      expect(await noteCounter(org)).toBe(0)
    })
  })

  describe('efecto en el cobro del original', () => {
    it('documento ya cobrado: queda saldo a favor y el estado sigue pagado', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)], { paid: true }) // 2.380 cobrado
      const [item] = await itemsOf(inv)

      const result = await credit(org, inv, [{ itemId: item.id, quantity: 1 }])
      expect(result.success).toContain('Saldo a favor del cliente')
      expect(result.success).toContain('fuera del sistema')
      expect(result.creditNote?.balance).toBe(-1190)
      expect(await invoiceRow(inv)).toMatchObject({ payment_status: 'paid', paid_total: '2380.00', credit_total: '1190.00' })

      const view = await service().getDetail(userId, org, inv)
      expect(view?.detail).toMatchObject({ total: 2380, creditTotal: 1190, paidTotal: 2380, balance: -1190 })
    })

    it('cobro parcial: el estado se mide contra lo que queda por cobrar', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)]) // 2.380
      const [item] = await itemsOf(inv)
      await service().addPayment(userId, org, { invoiceId: inv, amount: 1000, method: 'cash', reference: '' })

      await credit(org, inv, [{ itemId: item.id, quantity: 1 }]) // neto 1.190, cobrado 1.000
      expect(await invoiceRow(inv)).toMatchObject({ payment_status: 'partial', paid_total: '1000.00' })
      await service().addPayment(userId, org, { invoiceId: inv, amount: 190, method: 'cash', reference: '' })
      expect(await invoiceRow(inv)).toMatchObject({ payment_status: 'paid', paid_total: '1190.00' })
    })

    it('documento sin cobrar y acreditado por completo queda saldado', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 1)])
      const [item] = await itemsOf(inv)
      const result = await credit(org, inv, [{ itemId: item.id, quantity: 1 }])
      expect(result.success).toContain('El documento queda sin saldo pendiente.')
      const original = await invoiceRow(inv)
      expect(original).toMatchObject({ payment_status: 'paid', paid_total: '0.00', credit_total: '1190.00' })
      expect(original.paid_at).not.toBeNull()
    })

    it('después de una nota solo se cobra lo que queda; el exceso se rechaza', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }]) // quedan 1.190
      expect((await service().addPayment(userId, org, { invoiceId: inv, amount: 1191, method: 'cash', reference: '' })).error).not.toBe('')
      expect((await service().addPayment(userId, org, { invoiceId: inv, amount: 1190, method: 'cash', reference: '' })).error).toBe('')
      expect((await invoiceRow(inv)).payment_status).toBe('paid')
    })

    it('anular un cobro recalcula contra lo que queda por cobrar', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }])
      await service().addPayment(userId, org, { invoiceId: inv, amount: 1190, method: 'cash', reference: '' })
      const [payment] = await q<{ id: string }>(`select id from invoice_payments where invoice_id=$1`, [inv])
      const voided = await service().voidPayment(userId, org, { paymentId: payment.id, reason: 'Error de monto' })
      expect(voided.error).toBe('')
      expect(await invoiceRow(inv)).toMatchObject({ payment_status: 'unpaid', paid_total: '0.00' })
    })

    it('anular un cobro deja "pagado" si lo cobrado todavía cubre lo que queda por cobrar', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)]) // 2.380
      const [item] = await itemsOf(inv)
      await service().addPayment(userId, org, { invoiceId: inv, amount: 1190, method: 'cash', reference: '' })
      await service().addPayment(userId, org, { invoiceId: inv, amount: 1190, method: 'card', reference: '' })
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }]) // por cobrar: 1.190
      const [card] = await q<{ id: string }>(`select id from invoice_payments where invoice_id=$1 and method='card'`, [inv])
      await service().voidPayment(userId, org, { paymentId: card.id, reason: 'Error de monto' })
      expect(await invoiceRow(inv)).toMatchObject({ payment_status: 'paid', paid_total: '1190.00' })
    })

    it('una nota de crédito no recibe cobros', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)
      const note = (await credit(org, inv, [{ itemId: item.id, quantity: 1 }])).creditNote!
      expect((await service().addPayment(userId, org, { invoiceId: note.id, amount: 100, method: 'cash', reference: '' })).error).toBe('Una nota de crédito no recibe cobros')
    })
  })

  describe('anulaciones', () => {
    it('un documento con notas emitidas no se anula, y una nota tampoco; sin notas sigue anulándose', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const free = await issueInvoice(org, [line(cola, 1)])
      const [item] = await itemsOf(inv)
      const note = (await credit(org, inv, [{ itemId: item.id, quantity: 1 }])).creditNote!
      const stockBefore = await stockOf(org, cola)

      expect((await service().voidInvoice(userId, org, { invoiceId: inv, reason: 'Anular todo' })).error).toBe('El documento tiene notas de crédito emitidas: no se puede anular')
      expect((await service().voidInvoice(userId, org, { invoiceId: note.id, reason: 'Anular nota' })).error).toBe('Una nota de crédito emitida no se puede anular')
      expect(await stockOf(org, cola)).toBe(stockBefore) // los rechazos no tocan el stock
      expect((await invoiceRow(inv)).status).toBe('issued')

      expect((await service().voidInvoice(userId, org, { invoiceId: free, reason: 'Error de digitación' })).error).toBe('')
    })
  })

  describe('lectura', () => {
    it('el detalle de la nota apunta al original y el del original lista sus notas', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 3)])
      const [item] = await itemsOf(inv)
      const n1 = (await credit(org, inv, [{ itemId: item.id, quantity: 1 }])).creditNote!
      const n2 = (await credit(org, inv, [{ itemId: item.id, quantity: 1 }])).creditNote!

      const noteView = await service().getDetail(userId, org, n1.id)
      expect(noteView?.detail).toMatchObject({
        documentType: 'credit_note', number: 1, creditReason: 'Devolución del cliente', balance: 0, creditNotes: [],
        relatedInvoice: { id: inv, documentType: 'invoice', number: 1 },
      })
      const originalView = await service().getDetail(userId, org, inv)
      expect(originalView?.detail.creditTotal).toBe(2380)
      expect(originalView?.detail.creditNotes.map((n) => n.number)).toEqual([n1.number, n2.number])
      expect(originalView?.detail.relatedInvoice).toBeNull()
    })

    it('la lista incluye la nota pero no la trata como cuenta por cobrar', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }])

      const all = await page(org, 'all')
      expect(all.rows.map((r) => r.documentType).sort()).toEqual(['credit_note', 'invoice'])
      const unpaid = await page(org, 'unpaid')
      expect(unpaid.rows.map((r) => r.documentType)).toEqual(['invoice'])
      const paid = await page(org, 'paid')
      expect(paid.rows).toEqual([])
    })

    it('la búsqueda por número entiende el prefijo de la nota y respeta el que configuró la empresa', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }])
      const types = async (search: string, documentPrefixes?: BillingSettings['documentPrefixes']) =>
        (await page(org, 'all', { search, documentPrefixes })).rows.map((r) => r.documentType).sort()

      expect(await types('NC-000001')).toEqual(['credit_note'])
      expect(await types('nc 1')).toEqual(['credit_note'])
      expect(await types('F-000001')).toEqual(['invoice'])
      expect(await types('1')).toEqual(['credit_note', 'invoice']) // solo el número: cualquier tipo
      expect(await types('CR-1', { ...settings.documentPrefixes, credit_note: 'CR' })).toEqual(['credit_note'])
      expect(await types('NC-1', { ...settings.documentPrefixes, credit_note: 'CR' })).toEqual([]) // ya no es su prefijo
    })

    it('el filtro por tipo separa las notas de las facturas', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }])
      expect((await page(org, 'all', { documentType: 'credit_note' })).rows.map((r) => r.documentType)).toEqual(['credit_note'])
      expect((await page(org, 'all', { documentType: 'invoice' })).rows.map((r) => r.documentType)).toEqual(['invoice'])
    })

    it('la lista informa lo acreditado de cada documento', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 2)])
      const [item] = await itemsOf(inv)
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }])
      const rows = (await page(org, 'all')).rows
      expect(rows.find((r) => r.documentType === 'invoice')).toMatchObject({ total: 2380, creditTotal: 1190 })
      expect(rows.find((r) => r.documentType === 'credit_note')).toMatchObject({ total: 1190, creditTotal: 0 })
    })

    it('el contexto trae el desglose para calcular la nota igual que el servidor', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 3, { discountType: 'percent', discountValue: 10 })]) // 32.130? no: 3 × 1.190 − 10 %
      const [item] = await itemsOf(inv)
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }])
      const view = await service().getCreditContext(userId, org, inv)
      const source = view!.context.items[0].source
      expect(source).toMatchObject({ quantity: 3, taxRate: 19 })
      expect(source.original.total).toBe(source.original.net + source.original.tax)
      expect(source.credited).toMatchObject({ quantity: 1 })
      expect(source.credited.total).toBe(view!.context.items[0].creditedTotal)
      expect(source.original.total - source.credited.total).toBe(view!.context.items[0].remainingTotal)
    })

    it('el contexto de acreditación muestra lo que queda por línea', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { stock: 10 })
      const inv = await issueInvoice(org, [line(cola, 3)])
      const [item] = await itemsOf(inv)
      await credit(org, inv, [{ itemId: item.id, quantity: 1 }])

      const view = await service().getCreditContext(userId, org, inv)
      expect(view?.context.invoice).toMatchObject({ number: 1, total: 3570, creditTotal: 1190, balance: 2380 })
      expect(view?.context.items[0]).toMatchObject({ quantity: 3, creditedQuantity: 1, remainingQuantity: 2, lineTotal: 3570, creditedTotal: 1190, remainingTotal: 2380, tracksStock: true })
      expect(await service(['pos.facturacion.read']).getCreditContext(userId, org, inv)).toBeNull() // sin permiso
      const note = (await q<{ id: string }>(`select id from invoices where related_invoice_id=$1`, [inv]))[0]
      expect(await service().getCreditContext(userId, org, note.id)).toBeNull() // una nota no se acredita
    })
  })

  describe('aislamiento entre empresas', () => {
    it('no se puede acreditar un documento de otra empresa', async () => {
      const orgA = await newOrg()
      const orgB = await newOrg()
      const cola = await newProduct(orgA, { stock: 5 })
      const inv = await issueInvoice(orgA, [line(cola, 1)])
      const [item] = await itemsOf(inv)
      expect((await credit(orgB, inv, [{ itemId: item.id, quantity: 1 }])).error).toBe('El documento no existe')
      expect((await invoiceRow(inv)).credit_total).toBe('0.00')
    })
  })
})
