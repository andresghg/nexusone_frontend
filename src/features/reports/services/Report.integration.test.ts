// Reportes contra Postgres real (PGlite): repositorio + servicio, con documentos emitidos por los servicios reales.
// Se salta solo si @electric-sql/pglite no está instalado.
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

import { billingSettingsRepository } from '@/features/billing/services/BillingSettingsRepository'
import { invoiceRepository } from '@/features/billing/services/InvoiceRepository'
import { InvoiceService } from '@/features/billing/services/InvoiceService'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '@/features/billing/types/billing'
import { customerRepository } from '@/features/customers/services/CustomerRepository'
import ExcelJS from 'exceljs'
import { loadReport } from './loadReport'
import { buildReportWorkbook } from './reportXlsx'
import { reportRepository } from './ReportRepository'
import { parseReportParams } from '../utils/reportParams'
import { ReportService } from './ReportService'

const sqlFile = hasPglite
  ? readdirSync(resolve(process.cwd(), 'db/sql')).filter((n) => n.endsWith('.sql')).sort().map((name) => readFileSync(resolve(process.cwd(), 'db/sql', name), 'utf8')).join('\n')
  : ''
const pg = () => holder.pg as Pg
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg().query<T>(text, params)).rows

let userId = ''
let clock = new Date('2026-11-23T15:00:00Z') // 12:00 del 23 de noviembre en Santiago
const at = (iso: string) => {
  clock = new Date(iso)
}
const settings: BillingSettings = structuredClone(DEFAULT_BILLING_SETTINGS)
const ALL = ['pos.facturacion.read', 'pos.facturacion.create', 'pos.facturacion.void', 'finanzas.reportes.read']
const access = (permissions: string[]) => ({
  authorize: async (_u: string, org: string, permission: string) =>
    permissions.includes(permission) ? ({ organizationId: org, role: 'admin', permissions } as never) : null,
})
const invoices = new InvoiceService(invoiceRepository, { find: async () => settings, save: async () => {} }, customerRepository, access(ALL), () => clock)
const reports = (permissions = ALL) => new ReportService(reportRepository, billingSettingsRepository, access(permissions), () => clock)

const newOrg = async (timezone?: string) => {
  const id = (await q<{ id: string }>(
    `insert into organizations(name, slug, legal_name, tax_id, address) values ('Org', $1, 'Acme SpA', '76.000.000-1', 'Calle 1') returning id`,
    [`s-${Math.random().toString(36).slice(2)}`],
  ))[0].id
  if (timezone) await q(`insert into billing_settings(organization_id, timezone) values ($1,$2)`, [id, timezone])
  return id
}
const newProduct = async (org: string, name: string, price: number, stock = 1000) => {
  const id = (await q<{ id: string }>(
    `insert into products(organization_id, sku, name, unit, price, track_stock) values ($1,$2,$3,'un',$4,true) returning id`,
    [org, `SKU-${name.toUpperCase().slice(0, 4)}`, name, price],
  ))[0].id
  await q(`insert into stock_movements(organization_id, product_id, type, delta) values ($1,$2,'in',$3)`, [org, id, stock])
  return id
}
const newCustomer = async (org: string, name: string) =>
  (await q<{ id: string }>(`insert into customers(organization_id, name) values ($1,$2) returning id`, [org, name]))[0].id

const productLine = (productId: string, quantity = 1) => ({
  productId, description: '', unit: '', quantity, unitPrice: 0, discountType: 'percent' as const, discountValue: 0, taxRate: null,
})
const freeLine = (description: string, unitPrice: number, quantity = 1) => ({
  productId: null, description, unit: 'un', quantity, unitPrice, discountType: 'percent' as const, discountValue: 0, taxRate: null,
})
const issue = async (
  org: string,
  lines: ReturnType<typeof productLine>[],
  over: { paid?: boolean; customerId?: string | null } = {},
) => {
  const result = await invoices.issue(userId, org, {
    documentType: 'invoice', customerId: over.customerId ?? null, dueDate: null, notes: '', paid: over.paid ?? false,
    idempotencyKey: crypto.randomUUID(), lines,
  })
  expect(result.error).toBe('')
  return result.invoice!.id
}
const itemOf = async (invoiceId: string, position = 1) =>
  (await q<{ id: string }>(`select id from invoice_items where invoice_id=$1 and position=$2`, [invoiceId, position]))[0].id
const credit = async (org: string, invoiceId: string, lines: { itemId: string; quantity: number }[]) => {
  const result = await invoices.issueCreditNote(userId, org, {
    invoiceId, reason: 'Devolución', idempotencyKey: crypto.randomUUID(), lines: lines.map((l) => ({ ...l, restock: false })),
  })
  expect(result.error).toBe('')
}
const setDue = (invoiceId: string, due: string) => q(`update invoices set due_date=$2 where id=$1`, [invoiceId, due])

const sales = async (org: string, from: string, to: string, permissions?: string[]) => {
  const result = await reports(permissions).sales(userId, org, { from, to })
  if (!('report' in result)) throw new Error(result.error)
  return result.report
}
const day = (report: Awaited<ReturnType<typeof sales>>, bucket: string) => report.points.find((p) => p.bucket === bucket)!

describe.skipIf(!hasPglite)('Reportes contra Postgres real', () => {
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

  describe('ventas', () => {
    it('agrupa por día de la empresa: un documento de las 23:30 locales cae en su día, no en el de UTC', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-22T14:00:00Z') // 11:00 del 22
      await issue(org, [productLine(cola, 2)]) // 2.380
      at('2026-11-23T02:30:00Z') // 23:30 del 22 (UTC ya es 23)
      await issue(org, [productLine(cola)]) // 1.190
      at('2026-11-23T03:30:00Z') // 00:30 del 23
      await issue(org, [productLine(cola)]) // 1.190

      const report = await sales(org, '2026-11-21', '2026-11-23')
      expect(report.granularity).toBe('day')
      expect(report.points.map((p) => [p.bucket, p.documents, p.invoicedTotal, p.invoicedSubtotal])).toEqual([
        ['2026-11-21', 0, 0, 0],
        ['2026-11-22', 2, 3570, 3000],
        ['2026-11-23', 1, 1190, 1000],
      ])
      expect(report.totals).toMatchObject({ documents: 3, invoicedTotal: 4760, netTotal: 4760, netSubtotal: 4000, netTax: 760, averageTicket: 1587 })
    })

    it('el rango incluye el primer y el último día completos', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-10T03:00:00Z') // 00:00 del 10 (primer instante)
      await issue(org, [productLine(cola)])
      at('2026-11-11T02:59:59Z') // 23:59:59 del 10 (último instante)
      await issue(org, [productLine(cola)])
      at('2026-11-11T03:00:00Z') // ya es el 11
      await issue(org, [productLine(cola)])
      const report = await sales(org, '2026-11-10', '2026-11-10')
      expect(report.points).toHaveLength(1)
      expect(report.points[0]).toMatchObject({ bucket: '2026-11-10', documents: 2 })
    })

    it('las anuladas y los borradores no cuentan', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-20T15:00:00Z')
      await issue(org, [productLine(cola)])
      const anulada = await issue(org, [productLine(cola, 5)])
      expect((await invoices.voidInvoice(userId, org, { invoiceId: anulada, reason: 'Error de digitación' })).error).toBe('')
      await q(
        `insert into invoices(organization_id, currency, currency_decimals, tax_name, prices_include_tax, subtotal, tax_total, total)
         values ($1,'CLP',0,'IVA',true,1000,190,1190)`,
        [org],
      )
      const report = await sales(org, '2026-11-20', '2026-11-20')
      expect(report.totals).toMatchObject({ documents: 1, invoicedTotal: 1190 })
    })

    it('una nota de crédito resta el día en que se emite, no el de la venta que corrige', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-20T15:00:00Z')
      const inv = await issue(org, [productLine(cola, 2)]) // 2.380
      at('2026-11-22T15:00:00Z')
      await credit(org, inv, [{ itemId: await itemOf(inv), quantity: 1 }]) // −1.190

      const report = await sales(org, '2026-11-20', '2026-11-22')
      expect(report.points.map((p) => [p.bucket, p.netTotal, p.creditNotes])).toEqual([
        ['2026-11-20', 2380, 0],
        ['2026-11-21', 0, 0],
        ['2026-11-22', -1190, 1], // ese día solo hubo la devolución
      ])
      expect(report.totals).toMatchObject({ documents: 1, creditNotes: 1, invoicedTotal: 2380, creditedTotal: 1190, netTotal: 1190, netSubtotal: 1000, netTax: 190, averageTicket: 2380 })
      // mirando solo el día de la venta, la devolución todavía no existe
      expect((await sales(org, '2026-11-20', '2026-11-20')).totals).toMatchObject({ netTotal: 2380, creditNotes: 0 })
    })

    it('en rangos largos agrupa por mes, y respeta el cambio de mes en la zona de la empresa', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-09-15T15:00:00Z')
      await issue(org, [productLine(cola)])
      at('2026-11-01T02:30:00Z') // 23:30 del 31 de octubre en Santiago
      await issue(org, [productLine(cola)])
      at('2026-11-01T03:30:00Z') // 00:30 del 1 de noviembre
      await issue(org, [productLine(cola)])

      const report = await sales(org, '2026-09-01', '2026-11-30')
      expect(report.granularity).toBe('month')
      expect(report.points.map((p) => [p.bucket, p.documents])).toEqual([['2026-09', 1], ['2026-10', 1], ['2026-11', 1]])
    })

    it('usa la zona horaria configurada por la empresa', async () => {
      const santiago = await newOrg()
      const nuevaYork = await newOrg('America/New_York')
      for (const org of [santiago, nuevaYork]) {
        const cola = await newProduct(org, 'Cola', 1190)
        at('2026-11-23T03:30:00Z') // 00:30 del 23 en Santiago (UTC-3), 22:30 del 22 en Nueva York (UTC-5)
        await issue(org, [productLine(cola)])
      }
      expect((await sales(santiago, '2026-11-22', '2026-11-23')).points.map((p) => p.documents)).toEqual([0, 1])
      expect((await sales(nuevaYork, '2026-11-22', '2026-11-23')).points.map((p) => p.documents)).toEqual([1, 0])
    })

    it('cuenta lo cobrado en el período por fecha de cobro, sin los cobros anulados ni los de documentos anulados', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-20T15:00:00Z')
      await issue(org, [productLine(cola, 2)], { paid: true }) // cobrado al emitir: 2.380 el 20
      const b = await issue(org, [productLine(cola, 2)]) // 2.380 sin cobrar
      const anulado = await issue(org, [productLine(cola)], { paid: true }) // 1.190 cobrado... y luego se anula
      await invoices.voidInvoice(userId, org, { invoiceId: anulado, reason: 'Error de digitación' })
      at('2026-11-22T15:00:00Z')
      await invoices.addPayment(userId, org, { invoiceId: b, amount: 1000, method: 'cash', reference: '' })
      await invoices.addPayment(userId, org, { invoiceId: b, amount: 500, method: 'cash', reference: '' })
      const [payment] = await q<{ id: string }>(`select id from invoice_payments where invoice_id=$1 and amount=500`, [b])
      await invoices.voidPayment(userId, org, { paymentId: payment.id, reason: 'Error de monto' })

      expect((await sales(org, '2026-11-20', '2026-11-22')).totals.collected).toBe(3380)
      expect((await sales(org, '2026-11-21', '2026-11-22')).totals.collected).toBe(1000)
      expect((await sales(org, '2026-11-20', '2026-11-20')).totals.collected).toBe(2380)
    })

    it('no mezcla empresas', async () => {
      const a = await newOrg()
      const b = await newOrg()
      const colaA = await newProduct(a, 'Cola', 1190)
      const colaB = await newProduct(b, 'Cola', 1190)
      at('2026-11-20T15:00:00Z')
      await issue(a, [productLine(colaA)])
      await issue(b, [productLine(colaB, 3)])
      expect((await sales(a, '2026-11-20', '2026-11-20')).totals).toMatchObject({ documents: 1, invoicedTotal: 1190 })
      expect((await sales(b, '2026-11-20', '2026-11-20')).totals).toMatchObject({ documents: 1, invoicedTotal: 3570 })
    })

    it('sin permiso de reportes no entrega nada', async () => {
      const org = await newOrg()
      const result = await reports(['pos.facturacion.read']).sales(userId, org, { from: '2026-11-01', to: '2026-11-02' })
      expect(result).toEqual({ error: 'No tienes permisos para ver los reportes' })
    })
  })

  describe('productos más vendidos', () => {
    const top = async (org: string, from: string, to: string, extra: { rank?: 'revenue' | 'quantity'; limit?: number } = {}) => {
      const result = await reports().topProducts(userId, org, { from, to, ...extra })
      if (!('report' in result)) throw new Error(result.error)
      return result.report.products
    }

    async function scenario() {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      const agua = await newProduct(org, 'Agua', 400)
      at('2026-11-20T15:00:00Z')
      const doc1 = await invoices.issue(userId, org, {
        documentType: 'invoice', customerId: null, dueDate: null, notes: '', paid: false, idempotencyKey: crypto.randomUUID(),
        lines: [productLine(cola, 5), productLine(agua, 10), freeLine('Flete', 2000)],
      })
      const inv1 = doc1.invoice!.id
      at('2026-11-21T15:00:00Z')
      await issue(org, [productLine(cola, 1)])
      at('2026-11-22T15:00:00Z')
      await credit(org, inv1, [{ itemId: await itemOf(inv1, 1), quantity: 2 }, { itemId: await itemOf(inv1, 3), quantity: 1 }]) // 2 colas y el flete completo
      return { org, cola, agua, inv1 }
    }

    it('descuenta lo acreditado, ordena por importe y deja fuera lo totalmente acreditado', async () => {
      const { org, cola, agua } = await scenario()
      const products = await top(org, '2026-11-20', '2026-11-23')
      expect(products.map((p) => [p.description, p.quantity, p.total, p.net])).toEqual([
        ['Cola', 4, 4760, 4000], // 5 + 1 − 2 unidades
        ['Agua', 10, 4000, 3361],
      ])
      expect(products[0]).toMatchObject({ productId: cola, sku: 'SKU-COLA', unit: 'un' })
      expect(products[1].productId).toBe(agua)
      // el flete se vendió y se acreditó entero: no aparece
      expect(products.some((p) => p.description === 'Flete')).toBe(false)
    })

    it('se puede ordenar por cantidad', async () => {
      const { org } = await scenario()
      expect((await top(org, '2026-11-20', '2026-11-23', { rank: 'quantity' })).map((p) => p.description)).toEqual(['Agua', 'Cola'])
    })

    it('el límite recorta la lista', async () => {
      const { org } = await scenario()
      expect((await top(org, '2026-11-20', '2026-11-23', { limit: 1 })).map((p) => p.description)).toEqual(['Cola'])
    })

    it('una devolución posterior al rango no resta dentro del rango', async () => {
      const { org, inv1 } = await scenario()
      at('2026-11-25T15:00:00Z')
      await credit(org, inv1, [{ itemId: await itemOf(inv1, 1), quantity: 1 }])
      const cola = async (to: string) => (await top(org, '2026-11-20', to)).find((p) => p.description === 'Cola')
      expect(await cola('2026-11-23')).toMatchObject({ quantity: 4, total: 4760 })
      expect(await cola('2026-11-25')).toMatchObject({ quantity: 3, total: 3570 }) // con la devolución del 25
    })

    it('mirando solo el día de la venta la devolución aún no existe', async () => {
      const { org } = await scenario()
      const products = await top(org, '2026-11-20', '2026-11-20')
      expect(products.map((p) => [p.description, p.quantity])).toEqual([['Cola', 5], ['Agua', 10], ['Flete', 1]]) // por importe: 5.950, 4.000, 2.000
    })

    it('los conceptos libres se agrupan por descripción; los documentos anulados no cuentan', async () => {
      const org = await newOrg()
      at('2026-11-20T15:00:00Z')
      await issue(org, [freeLine('Flete', 2000)] as never)
      await issue(org, [freeLine('Flete', 2000, 2)] as never)
      await issue(org, [freeLine('Instalación', 5000)] as never)
      const anulada = await issue(org, [freeLine('Flete', 2000, 10)] as never)
      await invoices.voidInvoice(userId, org, { invoiceId: anulada, reason: 'Error de digitación' })

      const products = await top(org, '2026-11-20', '2026-11-20')
      expect(products.map((p) => [p.description, p.productId, p.quantity, p.total])).toEqual([
        ['Flete', null, 3, 6000],
        ['Instalación', null, 1, 5000],
      ])
    })

    it('con el mismo importe ordena por nombre, siempre igual', async () => {
      const org = await newOrg()
      const zeta = await newProduct(org, 'Zeta', 1190)
      const medio = await newProduct(org, 'Medio', 1190)
      const alfa = await newProduct(org, 'Alfa', 1190)
      at('2026-11-20T15:00:00Z')
      await issue(org, [productLine(zeta, 2), productLine(medio, 2), productLine(alfa, 2)])
      for (const rank of ['revenue', 'quantity'] as const) {
        expect((await top(org, '2026-11-20', '2026-11-20', { rank })).map((p) => p.description)).toEqual(['Alfa', 'Medio', 'Zeta'])
      }
    })

    it('no mezcla empresas', async () => {
      const a = await newOrg()
      const b = await newOrg()
      const colaA = await newProduct(a, 'Cola', 1190)
      const colaB = await newProduct(b, 'Cola', 1190)
      at('2026-11-20T15:00:00Z')
      await issue(a, [productLine(colaA, 1)])
      await issue(b, [productLine(colaB, 7)])
      expect((await top(a, '2026-11-20', '2026-11-20'))[0].quantity).toBe(1)
      expect((await top(b, '2026-11-20', '2026-11-20'))[0].quantity).toBe(7)
    })
  })

  describe('cuentas por cobrar', () => {
    async function ledger() {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      const ana = await newCustomer(org, 'Ana Pérez')
      const beto = await newCustomer(org, 'Beto Soto')
      at('2026-09-01T15:00:00Z')

      const a = await issue(org, [productLine(cola)], { customerId: ana }) // 1.190, vence 30/11 (al día)
      const b = await issue(org, [productLine(cola, 2)], { customerId: beto }) // 2.380, 1.000 cobrados, vencido hace 10 días
      const c = await issue(org, [productLine(cola)], { customerId: ana }) // 1.190, vencido hace 53 días
      const d = await issue(org, [productLine(cola)]) // 1.190, vencido hace 100 días, sin cliente
      const e = await issue(org, [productLine(cola, 2)]) // 2.380 − nota de 1.190 = 1.190, vencido hace 64 días
      const pagada = await issue(org, [productLine(cola)], { paid: true })
      const acreditada = await issue(org, [productLine(cola)])
      const anulada = await issue(org, [productLine(cola)])
      const sobrepagada = await issue(org, [productLine(cola, 2)], { paid: true })

      await setDue(a, '2026-11-30')
      await setDue(b, '2026-11-13')
      await setDue(c, '2026-10-01')
      await setDue(d, '2026-08-15')
      await setDue(e, '2026-09-20')
      await invoices.addPayment(userId, org, { invoiceId: b, amount: 1000, method: 'cash', reference: '' })
      await credit(org, e, [{ itemId: await itemOf(e), quantity: 1 }])
      await credit(org, acreditada, [{ itemId: await itemOf(acreditada), quantity: 1 }])
      await credit(org, sobrepagada, [{ itemId: await itemOf(sobrepagada), quantity: 1 }]) // pagó 2.380 y debe 1.190: no debe nada
      await invoices.voidInvoice(userId, org, { invoiceId: anulada, reason: 'Error de digitación' })
      void pagada
      at('2026-11-23T15:00:00Z')
      return { org, ana, beto }
    }
    const receivables = async (org: string, permissions?: string[]) => {
      const result = await reports(permissions).receivables(userId, org)
      if (!('report' in result)) throw new Error(result.error)
      return result.report
    }

    it('suma lo que se debe descontando cobros y notas de crédito, y deja fuera lo pagado, acreditado, anulado y las notas mismas', async () => {
      const { org } = await ledger()
      const report = await receivables(org)
      expect(report).toMatchObject({ asOf: '2026-11-23', documents: 5, total: 6140, overdueDocuments: 4, overdue: 4950 })
    })

    it('reparte por tramos de atraso según la fecha de vencimiento', async () => {
      const { org } = await ledger()
      const { aging } = await receivables(org)
      expect(aging.map((row) => [row.bucket, row.documents, row.amount])).toEqual([
        ['current', 1, 1190], // vence el 30 de noviembre
        ['d1_30', 1, 1380], // 10 días de atraso: 2.380 − 1.000 cobrados
        ['d31_60', 1, 1190], // 53 días
        ['d61_90', 1, 1190], // 64 días: 2.380 − 1.190 acreditados
        ['d90_plus', 1, 1190], // 100 días
      ])
    })

    it('los tramos cambian con el día: el vencimiento de hoy aún está al día y el de ayer ya tiene 1 día de atraso', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-01T15:00:00Z')
      const hoy = await issue(org, [productLine(cola)])
      const ayer = await issue(org, [productLine(cola)])
      const hace30 = await issue(org, [productLine(cola)])
      const hace31 = await issue(org, [productLine(cola)])
      await setDue(hoy, '2026-11-23')
      await setDue(ayer, '2026-11-22')
      await setDue(hace30, '2026-10-24') // 30 días
      await setDue(hace31, '2026-10-23') // 31 días
      at('2026-11-23T15:00:00Z')
      const { aging } = await receivables(org)
      expect(aging.map((row) => [row.bucket, row.documents])).toEqual([['current', 1], ['d1_30', 2], ['d31_60', 1], ['d61_90', 0], ['d90_plus', 0]])
    })

    it('agrupa por cliente, de quien más debe a quien menos, y llama "Consumidor final" a quien no tiene nombre', async () => {
      const { org, ana, beto } = await ledger()
      const { debtors } = await receivables(org)
      // Ana y los documentos sin cliente deben lo mismo (2.380): primero el más antiguo
      expect(debtors.map((d) => [d.name, d.customerId, d.documents, d.amount, d.oldestDueDate])).toEqual([
        ['Consumidor final', null, 2, 2380, '2026-08-15'],
        ['Ana Pérez', ana, 2, 2380, '2026-10-01'],
        ['Beto Soto', beto, 1, 1380, '2026-11-13'],
      ])
    })

    it('ordena a los deudores por cuánto deben, no por cuán antigua es la deuda', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      const grande = await newCustomer(org, 'Cliente grande')
      const chico = await newCustomer(org, 'Cliente chico')
      at('2026-11-01T15:00:00Z')
      const g1 = await issue(org, [productLine(cola, 2)], { customerId: grande }) // 2.380, vence hace 3 días
      const g2 = await issue(org, [productLine(cola, 2)], { customerId: grande }) // 2.380
      const c1 = await issue(org, [productLine(cola)], { customerId: chico }) // 1.190, vencida hace 114 días
      await setDue(g1, '2026-11-20')
      await setDue(g2, '2026-11-20')
      await setDue(c1, '2026-08-01')
      at('2026-11-23T15:00:00Z')
      const { debtors } = await receivables(org)
      expect(debtors.map((d) => [d.name, d.amount])).toEqual([['Cliente grande', 4760], ['Cliente chico', 1190]])
    })

    it('"hoy" es el de la empresa, no el de UTC', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-01T15:00:00Z')
      const doc = await issue(org, [productLine(cola)])
      await setDue(doc, '2026-11-22')
      at('2026-11-23T02:00:00Z') // en UTC ya es 23; en Santiago todavía es 22: vence hoy, no está atrasado
      expect((await receivables(org)).aging[0]).toMatchObject({ bucket: 'current', documents: 1 })
      at('2026-11-23T04:00:00Z') // ya es 23 en Santiago: 1 día de atraso
      expect((await receivables(org)).aging[1]).toMatchObject({ bucket: 'd1_30', documents: 1 })
    })

    it('no mezcla empresas y exige permiso de reportes', async () => {
      const { org } = await ledger()
      const vacia = await newOrg()
      expect((await receivables(vacia)).total).toBe(0)
      expect(await reports(['pos.facturacion.read']).receivables(userId, org)).toEqual({ error: 'No tienes permisos para ver los reportes' })
    })
  })

  describe('panel de inicio', () => {
    it('calcula hoy, ayer, la semana, el mes y lo que se debe con datos reales', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-01T15:00:00Z')
      await issue(org, [productLine(cola, 3)]) // 3.570 (día 1)
      at('2026-11-18T15:00:00Z')
      await issue(org, [productLine(cola)]) // 1.190 (esta semana)
      at('2026-11-22T15:00:00Z')
      const ayer = await issue(org, [productLine(cola, 2)], { paid: true }) // 2.380 (ayer)
      at('2026-11-23T15:00:00Z')
      await issue(org, [productLine(cola)]) // 1.190 (hoy)
      await credit(org, ayer, [{ itemId: await itemOf(ayer), quantity: 1 }]) // −1.190 hoy

      const summary = await reports(['pos.facturacion.read']).dashboard(userId, org)
      expect(summary).toMatchObject({
        today: { netTotal: 0, documents: 1 }, // vendió 1.190 y devolvió 1.190
        yesterday: { netTotal: 2380 },
        week: { documents: 3 }, // 18, 22 y 23
        month: { netTotal: 7140, documents: 4, averageTicket: 2083 }, // facturado 8.330 − 1.190 acreditados; ticket = 8.330 / 4 = 2.082,5 → 2.083
        receivables: { total: 3570 + 1190 + 1190, overdue: 0 },
        display: { currency: 'CLP' },
      })
    })

    it('sin ventas todo en cero', async () => {
      const org = await newOrg()
      at('2026-11-23T15:00:00Z')
      expect(await reports(['pos.facturacion.read']).dashboard(userId, org)).toMatchObject({
        today: { netTotal: 0, documents: 0 }, month: { documents: 0, averageTicket: 0 }, receivables: { total: 0, overdue: 0 },
      })
    })
  })

  describe('exportación a Excel con datos reales', () => {
    async function exported(org: string, params: Record<string, string>) {
      const loaded = await loadReport(userId, org, parseReportParams(params), { productLimit: 200 }, reports())
      if ('error' in loaded.data) throw new Error(loaded.data.error)
      const buffer = await buildReportWorkbook(loaded.data, { companyName: 'Acme SpA', generatedAt: clock })
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(buffer as unknown as ExcelJS.Buffer)
      return { book, loaded }
    }
    const rowWith = (sheet: ExcelJS.Worksheet, first: unknown) => {
      let found: ExcelJS.Row | undefined
      sheet.eachRow((row) => {
        if (!found && row.getCell(1).value === first) found = row
      })
      return found!
    }

    it('las ventas descargadas cuadran con las de la pantalla, devoluciones incluidas', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-20T15:00:00Z')
      const inv = await issue(org, [productLine(cola, 2)])
      at('2026-11-22T15:00:00Z')
      await credit(org, inv, [{ itemId: await itemOf(inv), quantity: 1 }])
      at('2026-11-23T15:00:00Z')

      const { book, loaded } = await exported(org, { periodo: 'personalizado', desde: '2026-11-20', hasta: '2026-11-23' })
      const sheet = book.getWorksheet('Ventas')!
      expect(loaded.data.tab === 'ventas' && 'report' in loaded.data && loaded.data.report.totals.netTotal).toBe(1190)
      expect(rowWith(sheet, 'Ventas netas (con impuesto)').getCell(2).value).toBe(1190)
      expect(rowWith(sheet, 'Neto sin impuesto').getCell(2).value).toBe(1000)
      const header = rowWith(sheet, 'Día')
      const rows = [1, 2].map((n) => sheet.getRow(header.number + n))
      expect(rows.map((r) => (r.getCell(1).value as Date).toISOString().slice(0, 10))).toEqual(['2026-11-20', '2026-11-22'])
      expect(rows.map((r) => r.getCell(8).value)).toEqual([2380, -1190]) // el día de la devolución en negativo
      expect(rowWith(sheet, 'Total').getCell(8).value).toEqual({ formula: `SUM(H${header.number + 1}:H${header.number + 2})`, result: 1190 })
    })

    it('los productos descargados descuentan lo acreditado y traen más que la pantalla', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      at('2026-11-20T15:00:00Z')
      const inv = await issue(org, [productLine(cola, 3)])
      at('2026-11-21T15:00:00Z')
      await credit(org, inv, [{ itemId: await itemOf(inv), quantity: 1 }])
      at('2026-11-23T15:00:00Z')
      const { book } = await exported(org, { tab: 'productos', periodo: 'personalizado', desde: '2026-11-20', hasta: '2026-11-23' })
      const sheet = book.getWorksheet('Productos')!
      expect(sheet.getRow(rowWith(sheet, 'N°').number + 1).values).toEqual([undefined, 1, 'Cola', 'SKU-COLA', 'un', 2, 2380, 2000])
    })

    it('por cobrar descargado cuadra con las deudas reales', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, 'Cola', 1190)
      const ana = await newCustomer(org, 'Ana Pérez')
      at('2026-11-01T15:00:00Z')
      const doc = await issue(org, [productLine(cola, 2)], { customerId: ana })
      await setDue(doc, '2026-11-13')
      at('2026-11-23T15:00:00Z')
      const { book } = await exported(org, { tab: 'cobrar' })
      const sheet = book.getWorksheet('Por cobrar')!
      expect(rowWith(sheet, 'Por cobrar').getCell(2).value).toBe(2380)
      expect(rowWith(sheet, 'Vencido').getCell(2).value).toBe(2380)
      expect(rowWith(sheet, '1 a 30 días de atraso').values).toEqual([undefined, '1 a 30 días de atraso', 1, 2380])
      expect(rowWith(sheet, 'Ana Pérez').getCell(3).value).toBe(2380)
    })

    it('sin permiso de reportes no se genera nada', async () => {
      const org = await newOrg()
      const loaded = await loadReport(userId, org, parseReportParams({}), { productLimit: 200 }, reports(['pos.facturacion.read']))
      expect(loaded.status).toBe('forbidden')
    })
  })
})
