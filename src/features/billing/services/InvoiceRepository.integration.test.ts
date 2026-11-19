// Pruebas de integración: emitir y anular contra un Postgres real (PGlite, en memoria), con el SQL
// de db/sql/001_billing.sql aplicado. Cubren lo que los tests con repositorios simulados no pueden:
// la transacción completa, los CHECK y triggers, la numeración sin saltos y la idempotencia.
//
// Para activarlas: npm i -D @electric-sql/pglite
// Sin esa dependencia se saltan solas y el resto de la suite no se ve afectado.
//
// Limitación: PGlite tiene una sola conexión, así que serializa las transacciones; los bloqueos de
// fila (FOR UPDATE) y las carreras reales entre conexiones no se pueden ejercitar aquí.
import { readFileSync } from 'node:fs'
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

// Import dinámico con nombre en variable: si el paquete no está instalado, Vite no falla al analizarlo
const pgliteName = '@electric-sql/pglite'
const pgliteModule = (await import(/* @vite-ignore */ pgliteName).catch(() => null)) as {
  PGlite: new () => Pg
} | null
const hasPglite = pgliteModule !== null

import { customerRepository } from '@/features/customers/services/CustomerRepository'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '../types/billing'
import type { IssueInvoiceInput } from '../schemas/invoiceSchema'
import { invoiceRepository } from './InvoiceRepository'
import { InvoiceService } from './InvoiceService'

const sqlFile = hasPglite
  ? ['001_billing.sql', '002_payments.sql', '003_product_tax.sql'].map((name) => readFileSync(resolve(process.cwd(), 'db/sql', name), 'utf8')).join('\n')
  : ''
const pg = () => holder.pg as Pg
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await pg().query<T>(text, params)).rows

let userId = ''
let settings: BillingSettings = structuredClone(DEFAULT_BILLING_SETTINGS)
let clock = new Date('2026-11-10T15:00:00Z')

const access = {
  authorize: async (_u: string, org: string) =>
    ({ organizationId: org, role: 'admin', permissions: ['pos.facturacion.create', 'pos.facturacion.void', 'pos.facturacion.adjust'] }) as never,
}
const settingsRepo = { find: async () => settings, save: async () => {} }
const service = () => new InvoiceService(invoiceRepository, settingsRepo, customerRepository, access, () => clock)

const newOrg = async (over: { legal?: string | null } = {}) =>
  (await q<{ id: string }>(
    `insert into organizations(name, slug, legal_name, tax_id, address) values ('Org', $1, $2, '76.000.000-1', 'Calle 1') returning id`,
    [`s-${Math.random().toString(36).slice(2)}`, over.legal === undefined ? 'Acme SpA' : over.legal],
  ))[0].id

const newProduct = async (
  org: string,
  o: { price?: number; stock?: number; track?: boolean; active?: boolean; name?: string; unit?: string; sku?: string; barcode?: string | null; taxRate?: number | null } = {},
) => {
  const id = (await q<{ id: string }>(
    `insert into products(organization_id, sku, barcode, name, unit, price, track_stock, active, tax_rate) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [org, o.sku ?? `SKU-${Math.random().toString(36).slice(2, 8)}`, o.barcode ?? null, o.name ?? 'Cola 1L', o.unit ?? 'un', o.price ?? 1190, o.track ?? true, o.active ?? true, o.taxRate ?? null],
  ))[0].id
  if ((o.track ?? true) && o.stock) {
    await q(`insert into stock_movements(organization_id, product_id, type, delta) values ($1,$2,'in',$3)`, [org, id, o.stock])
  }
  return id
}

const stockOf = async (org: string, product: string) =>
  Number((await q<{ s: string }>(`select coalesce(sum(delta),0) s from stock_movements where organization_id=$1 and product_id=$2`, [org, product]))[0].s)
const counts = async (org: string) => ({
  invoices: Number((await q<{ c: string }>(`select count(*) c from invoices where organization_id=$1`, [org]))[0].c),
  items: Number((await q<{ c: string }>(`select count(*) c from invoice_items where organization_id=$1`, [org]))[0].c),
  movements: Number((await q<{ c: string }>(`select count(*) c from stock_movements where organization_id=$1 and type in ('sale','sale_void')`, [org]))[0].c),
  counter: (await q<{ n: number }>(`select last_number n from invoice_counters where organization_id=$1 and document_type='invoice'`, [org]))[0]?.n ?? 0,
})

const line = (productId: string | null, quantity = 1, over = {}) => ({
  productId, description: productId ? '' : 'Flete', unit: '', quantity, unitPrice: productId ? 0 : 5000,
  discountType: 'percent' as const, discountValue: 0, taxRate: null, ...over,
})
const input = (lines: IssueInvoiceInput['lines'], over: Partial<IssueInvoiceInput> = {}): IssueInvoiceInput => ({
  documentType: 'invoice', customerId: null, dueDate: null, notes: '', paid: false,
  idempotencyKey: crypto.randomUUID(), lines, ...over,
})

describe.skipIf(!hasPglite)('Facturación contra Postgres real', () => {
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
    holder.db = drizzle({ client: client as never }) // sin tipos del paquete: el build no depende de él
  })

  describe('emitir', () => {
    it('guarda el documento, sus líneas y descuenta el stock', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { price: 1190, stock: 10 })
      const result = await service().issue(userId, org, input([line(cola, 2)]))

      expect(result.error).toBe('')
      expect(result.success).toBe('Documento emitido: F-000001')

      const [inv] = await q<Record<string, unknown>>(`select * from invoices where organization_id=$1`, [org])
      expect(inv).toMatchObject({
        status: 'issued', number: 1, document_type: 'invoice', payment_status: 'unpaid', currency: 'CLP', currency_decimals: 0,
        tax_name: 'IVA', prices_include_tax: true, subtotal: '2000.00', tax_total: '380.00', total: '2380.00',
        issuer_legal_name: 'Acme SpA', issuer_tax_id: '76.000.000-1', issuer_address: 'Calle 1', created_by: userId, issued_by: userId,
      })
      const [item] = await q<Record<string, unknown>>(`select * from invoice_items where invoice_id=$1`, [inv.id])
      expect(item).toMatchObject({
        position: 1, product_id: cola, description: 'Cola 1L', unit: 'un', quantity: '2.000', unit_price: '1190.00',
        tax_rate: '19.00', tracks_stock: true, line_gross: '2380.00', line_net: '2000.00', line_tax: '380.00', line_total: '2380.00',
      })
      expect(await stockOf(org, cola)).toBe(8)
      const [mv] = await q<Record<string, unknown>>(`select * from stock_movements where type='sale' and organization_id=$1`, [org])
      expect(mv).toMatchObject({ product_id: cola, delta: '-2.000', reason: 'Factura F-000001', reference_type: 'invoice', reference_id: inv.id, created_by: userId })
    })

    it('el precio sale de la base de datos aunque el navegador mande otro', async () => {
      const org = await newOrg()
      const cola = await newProduct(org, { price: 1190, stock: 5 })
      await service().issue(userId, org, input([line(cola, 1, { unitPrice: 1, description: 'GRATIS' })]))
      const [item] = await q<{ unit_price: string; description: string }>(`select unit_price, description from invoice_items where organization_id=$1`, [org])
      expect(item).toMatchObject({ unit_price: '1190.00', description: 'Cola 1L' })
    })

    it('numera correlativamente por tipo de documento', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 100 })
      const s = service()
      expect((await s.issue(userId, org, input([line(p)]))).success).toBe('Documento emitido: F-000001')
      expect((await s.issue(userId, org, input([line(p)]))).success).toBe('Documento emitido: F-000002')
      expect((await s.issue(userId, org, input([line(p)], { documentType: 'receipt' }))).success).toBe('Documento emitido: R-000001')
      expect((await s.issue(userId, org, input([line(p)]))).success).toBe('Documento emitido: F-000003')
    })

    it('un rechazo por stock no consume número ni deja nada guardado', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 1 })
      const s = service()
      await s.issue(userId, org, input([line(p, 1)])) // F-1, stock 0
      const before = await counts(org)

      const rejected = await s.issue(userId, org, input([line(p, 1)]))
      expect(rejected.error).toBe('Stock insuficiente: Cola 1L (disponible 0 un, pedido 1 un)')
      expect(await counts(org)).toEqual(before)

      await q(`insert into stock_movements(organization_id, product_id, type, delta) values ($1,$2,'in',5)`, [org, p])
      expect((await s.issue(userId, org, input([line(p, 1)]))).success).toBe('Documento emitido: F-000002') // sin saltos
    })

    it('es atómico: si un segundo producto no alcanza, el primero no se descuenta', async () => {
      const org = await newOrg()
      const a = await newProduct(org, { stock: 10, name: 'A' })
      const b = await newProduct(org, { stock: 1, name: 'B' })
      const before = await counts(org)

      const result = await service().issue(userId, org, input([line(a, 3), line(b, 5)]))
      expect(result.error).toBe('Stock insuficiente: B (disponible 1 un, pedido 5 un)')
      expect(await stockOf(org, a)).toBe(10)
      expect(await stockOf(org, b)).toBe(1)
      expect(await counts(org)).toEqual(before)
    })

    it('informa todos los productos que no alcanzan, no solo el primero', async () => {
      const org = await newOrg()
      const a = await newProduct(org, { stock: 1, name: 'Pan', unit: 'kg' })
      const b = await newProduct(org, { stock: 2, name: 'Té' })
      const result = await service().issue(userId, org, input([line(a, 2.5), line(b, 3)]))
      expect(result.error).toBe('Stock insuficiente: Pan (disponible 1 kg, pedido 2.5 kg); Té (disponible 2 un, pedido 3 un)')
    })

    it('un producto repetido en varias líneas se valida y descuenta sumado', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 5 })
      const s = service()
      expect((await s.issue(userId, org, input([line(p, 3), line(p, 3)]))).error).toContain('pedido 6 un')
      expect((await s.issue(userId, org, input([line(p, 2), line(p, 3)]))).error).toBe('')
      expect(await stockOf(org, p)).toBe(0)
      const movements = await q(`select * from stock_movements where type='sale' and organization_id=$1`, [org])
      expect(movements).toHaveLength(1) // un movimiento por producto
      expect((await q(`select count(*) c from invoice_items where organization_id=$1`, [org]))[0]).toMatchObject({ c: 2 })
    })

    it('cantidades decimales exactas: 0,1 + 0,2 con stock 0,3 alcanza justo', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 0.3, unit: 'kg' })
      expect((await service().issue(userId, org, input([line(p, 0.1), line(p, 0.2)]))).error).toBe('')
      expect(await stockOf(org, p)).toBe(0)
    })

    it('con "permitir vender sin stock" el stock puede quedar negativo', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 1 })
      settings = { ...settings, allowNegativeStock: true }
      try {
        expect((await service().issue(userId, org, input([line(p, 4)]))).error).toBe('')
        expect(await stockOf(org, p)).toBe(-3)
      } finally {
        settings = structuredClone(DEFAULT_BILLING_SETTINGS)
      }
    })

    it('productos sin control de stock y conceptos libres no mueven inventario', async () => {
      const org = await newOrg()
      const servicio = await newProduct(org, { track: false, price: 20000, name: 'Instalación' })
      const result = await service().issue(userId, org, input([line(servicio, 1), line(null, 1)]))
      expect(result.error).toBe('')
      expect((await counts(org)).movements).toBe(0)
      const items = await q<{ description: string; product_id: string | null; tracks_stock: boolean }>(`select description, product_id, tracks_stock from invoice_items where organization_id=$1 order by position`, [org])
      expect(items).toEqual([
        { description: 'Instalación', product_id: servicio, tracks_stock: false },
        { description: 'Flete', product_id: null, tracks_stock: false },
      ])
    })

    it('un producto de otra empresa no se puede facturar', async () => {
      const org = await newOrg()
      const other = await newOrg()
      const foreign = await newProduct(other, { stock: 10 })
      const result = await service().issue(userId, org, input([line(foreign, 1)]))
      expect(result.error).toBe('Línea 1: el producto ya no existe')
      expect(await stockOf(other, foreign)).toBe(10)
      expect((await counts(org)).invoices).toBe(0)
    })

    it('un producto archivado no se puede facturar', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10, active: false, name: 'Viejo' })
      expect((await service().issue(userId, org, input([line(p, 1)]))).error).toBe('Línea 1: "Viejo" está archivado y no se puede facturar')
    })
  })

  describe('idempotencia', () => {
    it('reenviar la misma solicitud devuelve el mismo documento y no descuenta dos veces', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10 })
      const s = service()
      const request = input([line(p, 2)])

      const first = await s.issue(userId, org, request)
      const second = await s.issue(userId, org, request)
      expect(second).toEqual(first)
      expect((await counts(org)).invoices).toBe(1)
      expect(await stockOf(org, p)).toBe(8)
    })

    it('dos solicitudes simultáneas con la misma clave: un solo documento', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10 })
      const request = input([line(p, 1)])
      const [a, b] = await Promise.all([service().issue(userId, org, request), service().issue(userId, org, request)])
      expect(a.error + b.error).toBe('')
      expect(a.invoice?.id).toBe(b.invoice?.id)
      expect((await counts(org)).invoices).toBe(1)
      expect(await stockOf(org, p)).toBe(9)
    })

    it('si la carrera llega al repositorio, la clave única lo detecta y devuelve el documento existente', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10, price: 1000 })
      const command = {
        userId, idempotencyKey: crypto.randomUUID(), documentType: 'invoice' as const, documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes,
        customer: null, issuer: { legalName: null, taxId: null, address: null }, currency: 'CLP', currencyDecimals: 0, taxName: 'IVA',
        pricesIncludeTax: true, allowNegativeStock: false, issuedAt: clock, dueDate: null, paid: false, paymentMethod: 'cash' as const, notes: null,
        totals: { subtotal: 840, discountTotal: 0, taxTotal: 160, total: 1000 },
        lines: [{ position: 1, productId: p, sku: 'X', description: 'Cola 1L', unit: 'un', quantity: 1, unitPrice: 1000, discountType: 'percent' as const,
          discountValue: 0, taxRate: 19, productTaxRate: null, tracksStock: true, gross: 1000, discount: 0, net: 840, tax: 160, total: 1000 }],
      }
      const first = await invoiceRepository.issue(org, command)
      const second = await invoiceRepository.issue(org, command) // se salta la comprobación previa del servicio
      expect(first.status).toBe('issued')
      expect(second).toMatchObject({ status: 'duplicate', invoice: { number: 1 } })
      expect(await stockOf(org, p)).toBe(9)
      expect((await counts(org)).invoices).toBe(1)
    })
  })

  describe('cambios mientras se prepara el documento', () => {
    const base = (p: string, over = {}) => ({
      userId, idempotencyKey: crypto.randomUUID(), documentType: 'invoice' as const, documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes,
      customer: null, issuer: { legalName: null, taxId: null, address: null }, currency: 'CLP', currencyDecimals: 0, taxName: 'IVA',
      pricesIncludeTax: true, allowNegativeStock: false, issuedAt: clock, dueDate: null, paid: false, paymentMethod: 'cash' as const, notes: null,
      totals: { subtotal: 840, discountTotal: 0, taxTotal: 160, total: 1000 },
      lines: [{ position: 1, productId: p, sku: 'X', description: 'Cola 1L', unit: 'un', quantity: 1, unitPrice: 1000, discountType: 'percent' as const,
        discountValue: 0, taxRate: 19, productTaxRate: null, tracksStock: true, gross: 1000, discount: 0, net: 840, tax: 160, total: 1000, ...over }],
    })

    it('si el precio cambió, no emite', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10, price: 1500 }) // en la base vale 1500, el documento se preparó con 1000
      const before = await counts(org)
      expect(await invoiceRepository.issue(org, base(p))).toEqual({ status: 'product_changed', productName: 'Cola 1L' })
      expect(await counts(org)).toEqual(before)
      expect(await stockOf(org, p)).toBe(10)
    })

    it('si el producto se archivó, no emite', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10, price: 1000, active: false })
      expect((await invoiceRepository.issue(org, base(p))).status).toBe('product_changed')
    })

    it('si dejó de controlar stock, no emite', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10, price: 1000, track: false })
      expect((await invoiceRepository.issue(org, base(p))).status).toBe('product_changed')
    })
  })

  describe('cliente, emisor y fechas', () => {
    it('copia los datos del cliente y de la empresa: editarlos después no altera el documento', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 5 })
      const { id: customerId } = await customerRepository.create(org, { name: 'Ana Pérez', taxId: '12345678-5', email: 'ana@x.cl', phone: null, address: 'Av. 1', notes: null })

      expect((await service().issue(userId, org, input([line(p)], { customerId }))).error).toBe('')
      await customerRepository.update(org, customerId, { name: 'Otro Nombre', taxId: '99999999-9', email: null, phone: null, address: null, notes: null })
      await q(`update organizations set legal_name='Cambiada SpA' where id=$1`, [org])

      const [inv] = await q<Record<string, unknown>>(`select * from invoices where organization_id=$1`, [org])
      expect(inv).toMatchObject({ customer_id: customerId, customer_name: 'Ana Pérez', customer_tax_id: '12345678-5', customer_email: 'ana@x.cl', customer_address: 'Av. 1', issuer_legal_name: 'Acme SpA' })
    })

    it('un cliente archivado o de otra empresa no se puede usar', async () => {
      const org = await newOrg()
      const other = await newOrg()
      const p = await newProduct(org, { stock: 5 })
      const data = { name: 'X', taxId: null, email: null, phone: null, address: null, notes: null }
      const archived = (await customerRepository.create(org, data)).id
      await customerRepository.setActive(org, archived, false)
      const foreign = (await customerRepository.create(other, data)).id

      expect((await service().issue(userId, org, input([line(p)], { customerId: archived }))).error).toBe('El cliente está archivado')
      expect((await service().issue(userId, org, input([line(p)], { customerId: foreign }))).error).toBe('El cliente no existe')
      expect((await counts(org)).invoices).toBe(0)
    })

    it('el vencimiento por defecto se cuenta desde hoy en la zona horaria de la empresa', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 5 })
      settings = { ...settings, defaultDueDays: 30 }
      const original = clock
      clock = new Date('2026-11-10T02:00:00Z') // en Santiago todavía es 9 de noviembre (23:00)
      try {
        await service().issue(userId, org, input([line(p)]))
      } finally {
        settings = structuredClone(DEFAULT_BILLING_SETTINGS)
        clock = original
      }
      const [inv] = await q<{ due_date: string }>(`select to_char(due_date,'YYYY-MM-DD') due_date from invoices where organization_id=$1`, [org])
      expect(inv.due_date).toBe('2026-12-09')
    })

    it('"cobrado al emitir" deja el documento pagado', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 5 })
      await service().issue(userId, org, input([line(p)], { paid: true, notes: ' nota ' }))
      const [inv] = await q<Record<string, unknown>>(`select payment_status, paid_at is not null as paid, notes from invoices where organization_id=$1`, [org])
      expect(inv).toEqual({ payment_status: 'paid', paid: true, notes: 'nota' })
    })
  })

  describe('integridad de montos con la base real', () => {
    it('40 documentos aleatorios: la base acepta todos y las líneas suman el total', async () => {
      const org = await newOrg()
      const products = await Promise.all(
        [990, 1190, 2500, 333.33, 19.99, 100].map((price, i) => newProduct(org, { price: Math.round(price * 100) / 100, stock: 100000, name: `P${i}` })),
      )
      let seed = 7
      const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
      const s = service()

      for (let i = 0; i < 40; i++) {
        const lines = Array.from({ length: 1 + Math.floor(rand() * 4) }, () =>
          line(products[Math.floor(rand() * products.length)], (1 + Math.floor(rand() * 30000)) / 1000, {
            discountType: 'percent', discountValue: Math.floor(rand() * 3000) / 100, taxRate: [null, 0, 10, 19][Math.floor(rand() * 4)],
          }),
        )
        settings = { ...settings, pricesIncludeTax: rand() < 0.5 }
        const result = await s.issue(userId, org, input(lines))
        expect(result.error, JSON.stringify(lines)).toBe('')
      }
      settings = structuredClone(DEFAULT_BILLING_SETTINGS)

      const bad = await q(`
        select i.id from invoices i
        join invoice_items l on l.invoice_id = i.id
        where i.organization_id = $1
        group by i.id, i.total, i.subtotal, i.tax_total
        having sum(l.line_total) <> i.total or sum(l.line_net) <> i.subtotal or sum(l.line_tax) <> i.tax_total`, [org])
      expect(bad).toEqual([])
      expect((await counts(org)).invoices).toBe(40)
      expect((await counts(org)).counter).toBe(40)
    })
  })

  describe('anular', () => {
    it('devuelve el stock, conserva el número y registra quién y por qué', async () => {
      const org = await newOrg()
      const a = await newProduct(org, { stock: 10, name: 'A' })
      const b = await newProduct(org, { stock: 5, name: 'B' })
      const s = service()
      const issued = await s.issue(userId, org, input([line(a, 4), line(b, 1), line(a, 1)]))
      expect(await stockOf(org, a)).toBe(5)
      clock = new Date('2026-11-11T12:00:00Z')

      const result = await s.voidInvoice(userId, org, { invoiceId: issued.invoice!.id, reason: ' Error de digitación ' })
      expect(result).toEqual({ error: '', success: 'Documento anulado: F-000001' })

      expect(await stockOf(org, a)).toBe(10)
      expect(await stockOf(org, b)).toBe(5)
      const [inv] = await q<Record<string, unknown>>(`select status, number, void_reason, voided_by, voided_at is not null as has_date from invoices where id=$1`, [issued.invoice!.id])
      expect(inv).toEqual({ status: 'void', number: 1, void_reason: 'Error de digitación', voided_by: userId, has_date: true })
      const voids = await q<{ reason: string; delta: string }>(`select reason, delta from stock_movements where type='sale_void' and organization_id=$1 order by delta`, [org])
      expect(voids).toEqual([
        { reason: 'Anulación Factura F-000001', delta: '1.000' },
        { reason: 'Anulación Factura F-000001', delta: '5.000' },
      ])
      // el siguiente documento sigue la numeración: el número anulado no se reutiliza
      expect((await s.issue(userId, org, input([line(a, 1)]))).success).toBe('Documento emitido: F-000002')
    })

    it('no se puede anular dos veces ni devolver stock dos veces', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10 })
      const s = service()
      const issued = await s.issue(userId, org, input([line(p, 3)]))
      const request = { invoiceId: issued.invoice!.id, reason: 'Duplicada' }

      expect((await s.voidInvoice(userId, org, request)).error).toBe('')
      expect((await s.voidInvoice(userId, org, request)).error).toBe('El documento ya está anulado')
      expect(await stockOf(org, p)).toBe(10)
      expect((await counts(org)).movements).toBe(2) // la venta y una sola anulación
    })

    it('dos anulaciones simultáneas devuelven el stock una sola vez', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10 })
      const s = service()
      const issued = await s.issue(userId, org, input([line(p, 3)]))
      const request = { invoiceId: issued.invoice!.id, reason: 'Duplicada' }
      const results = await Promise.all([s.voidInvoice(userId, org, request), s.voidInvoice(userId, org, request)])
      expect(results.filter((r) => r.error === '')).toHaveLength(1)
      expect(await stockOf(org, p)).toBe(10)
    })

    it('un documento de otra empresa o inexistente no se anula', async () => {
      const org = await newOrg()
      const other = await newOrg()
      const p = await newProduct(other, { stock: 10 })
      const issued = await service().issue(userId, other, input([line(p, 3)]))
      expect((await service().voidInvoice(userId, org, { invoiceId: issued.invoice!.id, reason: 'Intento' })).error).toBe('El documento no existe')
      expect((await service().voidInvoice(userId, org, { invoiceId: crypto.randomUUID(), reason: 'Intento' })).error).toBe('El documento no existe')
      expect(await stockOf(other, p)).toBe(7)
    })

    it('los productos sin stock y los conceptos libres no generan devolución', async () => {
      const org = await newOrg()
      const servicio = await newProduct(org, { track: false })
      const issued = await service().issue(userId, org, input([line(servicio, 1), line(null, 1)]))
      expect((await service().voidInvoice(userId, org, { invoiceId: issued.invoice!.id, reason: 'Error' })).error).toBe('')
      expect((await counts(org)).movements).toBe(0)
    })

    it('un documento emitido sigue protegido por la base: no se edita ni se borra', async () => {
      const org = await newOrg()
      const p = await newProduct(org, { stock: 10 })
      const issued = await service().issue(userId, org, input([line(p, 1)]))
      await expect(q(`update invoices set total = 1 where id=$1`, [issued.invoice!.id])).rejects.toThrow()
      await expect(q(`delete from invoices where id=$1`, [issued.invoice!.id])).rejects.toThrow(/no se puede eliminar/)
      await expect(q(`update invoice_items set quantity = 9 where invoice_id=$1`, [issued.invoice!.id])).rejects.toThrow(/no se pueden modificar/)
    })
  })

  describe('listar', () => {
    // Un conjunto fijo de documentos. "Hoy" para la lista es el 10 de nov. de 2026 en Santiago.
    //   F-1  Ana       15 oct   pagada
    //   F-2  Sur       2 nov    pendiente, venció el 5 nov
    //   R-1  (sin)     9 nov    pagado
    //   F-3  Ana       10 nov   pendiente, vence el 10 dic
    //   F-4  Sur       8 nov    anulada
    //   NV-1 (sin)     10 nov 02:30 UTC = 9 nov 23:30 en Santiago, pagada
    const TODAY = '2026-11-10T15:00:00Z'
    let org = ''
    let other = ''

    const labels = async (filters = {}, pagination = {}) => {
      const page = await service().list(userId, org, filters, pagination)
      const prefixes = page.display.documentPrefixes
      return page.rows.map((row) => `${prefixes[row.documentType]}-${row.number}`)
    }

    beforeAll(async () => {
      org = await newOrg()
      other = await newOrg()
      const servicio = await newProduct(org, { track: false, price: 1000, name: 'Servicio' })
      const make = async (name: string, taxId: string) =>
        (await customerRepository.create(org, { name, taxId, email: null, phone: null, address: null, notes: null })).id
      const ana = await make('Ana Pérez', '12345678-5')
      const sur = await make('Comercial Sur', '76123456-7')

      const issue = async (iso: string, over: Partial<IssueInvoiceInput>) => {
        clock = new Date(iso)
        const result = await service().issue(userId, org, input([line(servicio, 1)], over))
        expect(result.error).toBe('')
        return result.invoice!.id
      }
      await issue('2026-10-15T15:00:00Z', { customerId: ana, paid: true })
      await issue('2026-11-02T15:00:00Z', { customerId: sur, dueDate: '2026-11-05' })
      await issue('2026-11-09T15:00:00Z', { documentType: 'receipt', paid: true })
      await issue('2026-11-10T15:00:00Z', { customerId: ana, dueDate: '2026-12-10' })
      const f4 = await issue('2026-11-08T15:00:00Z', { customerId: sur })
      await issue('2026-11-10T02:30:00Z', { documentType: 'sales_note', paid: true })
      expect((await service().voidInvoice(userId, org, { invoiceId: f4, reason: 'Error' })).error).toBe('')
      clock = new Date(TODAY)
    })

    it('sin filtros: todo lo emitido y anulado, del más reciente al más antiguo', async () => {
      expect(await labels()).toEqual(['NV-1', 'F-4', 'F-3', 'R-1', 'F-2', 'F-1'])
    })

    it('cada fila trae lo necesario para mostrarla', async () => {
      const page = await service().list(userId, org, { payment: 'overdue' })
      expect(page.total).toBe(1)
      expect(page.rows[0]).toMatchObject({
        documentType: 'invoice', number: 2, status: 'issued', paymentStatus: 'unpaid', customerName: 'Comercial Sur',
        customerTaxId: '76123456-7', total: 1000, currency: 'CLP', currencyDecimals: 0, dueDate: '2026-11-05',
        overdue: true, voidReason: null, issuedAt: '2026-11-02T15:00:00.000Z',
      })
      const all = await service().list(userId, org)
      const find = (n: number, type: string) => all.rows.find((r) => r.number === n && r.documentType === type)!
      expect(find(3, 'invoice').overdue).toBe(false) // vence en diciembre
      expect(find(4, 'invoice')).toMatchObject({ status: 'void', overdue: false, voidReason: 'Error' })
      expect(find(1, 'receipt').customerName).toBeNull()
    })

    it('estado: emitidos o anulados', async () => {
      expect(await labels({ status: 'issued' })).toEqual(['NV-1', 'F-3', 'R-1', 'F-2', 'F-1'])
      expect(await labels({ status: 'void' })).toEqual(['F-4'])
    })

    it('cobro: pagados, pendientes y vencidos; un documento anulado nunca está "pendiente"', async () => {
      expect(await labels({ payment: 'paid' })).toEqual(['NV-1', 'R-1', 'F-1'])
      expect(await labels({ payment: 'unpaid' })).toEqual(['F-3', 'F-2'])
      expect(await labels({ payment: 'overdue' })).toEqual(['F-2'])
      expect(await labels({ payment: 'partial' })).toEqual([])
    })

    it('tipo de documento', async () => {
      expect(await labels({ documentType: 'receipt' })).toEqual(['R-1'])
      expect(await labels({ documentType: 'sales_note' })).toEqual(['NV-1'])
      expect(await labels({ documentType: 'invoice' })).toEqual(['F-4', 'F-3', 'F-2', 'F-1'])
    })

    it('períodos: días de calendario de la empresa, no del servidor', async () => {
      // NV-1 se emitió a las 02:30 UTC del 10, pero en Santiago todavía era el 9
      expect(await labels({ period: 'today' })).toEqual(['F-3'])
      expect(await labels({ period: 'week' })).toEqual(['NV-1', 'F-4', 'F-3', 'R-1'])
      expect(await labels({ period: 'month' })).toEqual(['NV-1', 'F-4', 'F-3', 'R-1', 'F-2'])
      expect(await labels({ period: 'last_month' })).toEqual(['F-1'])
    })

    it('el período sigue la zona horaria configurada', async () => {
      settings = { ...settings, timezone: 'UTC' }
      try {
        expect(await labels({ period: 'today' })).toEqual(['NV-1', 'F-3']) // en UTC, 02:30 ya es el día 10
      } finally {
        settings = structuredClone(DEFAULT_BILLING_SETTINGS)
      }
    })

    it('búsqueda por cliente, RUT (con o sin puntos) y número de documento', async () => {
      expect(await labels({ search: 'ana' })).toEqual(['F-3', 'F-1'])
      expect(await labels({ search: 'COMERCIAL' })).toEqual(['F-4', 'F-2'])
      expect(await labels({ search: '76.123' })).toEqual(['F-4', 'F-2'])
      expect(await labels({ search: '12345678-5' })).toEqual(['F-3', 'F-1'])
      // con prefijo: exactamente ese documento, no todos los que tienen el mismo número
      expect(await labels({ search: 'R-1' })).toEqual(['R-1'])
      expect(await labels({ search: 'nv 1' })).toEqual(['NV-1'])
      expect(await labels({ search: 'F-000001' })).toEqual(['F-1'])
      // sin prefijo: ese número en cualquier tipo
      expect(await labels({ search: '#3' })).toEqual(['F-3'])
      // un prefijo que la empresa no usa no busca por número
      expect(await labels({ search: 'X-3' })).toEqual([])
    })

    it('los comodines de LIKE se buscan literalmente', async () => {
      expect(await labels({ search: '%' })).toEqual([])
      expect(await labels({ search: '_' })).toEqual([])
    })

    it('combina filtros', async () => {
      expect(await labels({ payment: 'unpaid', period: 'month' })).toEqual(['F-3', 'F-2'])
      expect(await labels({ search: 'ana', status: 'issued', documentType: 'invoice' })).toEqual(['F-3', 'F-1'])
      expect(await labels({ status: 'void', payment: 'paid' })).toEqual([]) // anulado y pagado a la vez: nada
    })

    it('pagina sin repetir ni saltar filas y cuenta el total', async () => {
      const pages = await Promise.all([1, 2, 3, 4].map((page) => service().list(userId, org, {}, { page, pageSize: 2 })))
      expect(pages.map((p) => p.total)).toEqual([6, 6, 6, 6])
      expect(pages.map((p) => p.rows.length)).toEqual([2, 2, 2, 0])
      const ids = pages.flatMap((p) => p.rows.map((r) => r.id))
      expect(new Set(ids).size).toBe(6)
    })

    it('otra empresa no ve los documentos', async () => {
      expect(await service().list(userId, other)).toMatchObject({ rows: [], total: 0 })
    })

    it('un documento anulado conserva su número y sigue en la lista', async () => {
      const page = await service().list(userId, org, { status: 'void' })
      expect(page.rows).toHaveLength(1)
      expect(page.rows[0].number).toBe(4)
    })
  })

  describe('buscar productos', () => {
    let org = ''
    let other = ''
    const find = async (term: string, limit = 20) => (await invoiceRepository.searchProducts(org, term, limit)).map((p) => p.name)

    beforeAll(async () => {
      org = await newOrg()
      other = await newOrg()
      await newProduct(org, { name: 'Cola 1L', sku: 'COLA-1L', barcode: '7801234567890', price: 1190, stock: 8 })
      await newProduct(org, { name: 'Cola Zero 500ml', sku: 'COLA-Z5', barcode: '7801234500005', price: 890, stock: 0 })
      await newProduct(org, { name: 'Pan de molde', sku: 'PAN-01', barcode: null, price: 2500, stock: 3.5, unit: 'kg' })
      await newProduct(org, { name: 'Instalación', sku: 'SERV-01', price: 20000, track: false })
      await newProduct(org, { name: 'Cola vieja (archivada)', sku: 'COLA-OLD', active: false, stock: 5 })
      await newProduct(other, { name: 'Cola de otra empresa', sku: 'COLA-X', stock: 5 })
      await newProduct(org, { name: 'Descuento 50% Ltda', sku: 'PCT-50' })
    })

    it('por nombre, sin distinguir mayúsculas', async () => {
      expect(await find('cola')).toEqual(['Cola 1L', 'Cola Zero 500ml'])
      expect(await find('MOLDE')).toEqual(['Pan de molde'])
    })

    it('por SKU y por código de barras (completo o parcial)', async () => {
      expect(await find('serv-01')).toEqual(['Instalación'])
      expect(await find('7801234500005')).toEqual(['Cola Zero 500ml'])
      expect(await find('78012345')).toEqual(['Cola 1L', 'Cola Zero 500ml'])
    })

    it('un código de barras o SKU escrito completo va primero, aunque otro producto ordene antes por nombre', async () => {
      await newProduct(org, { name: 'ZZZ Exacto', sku: 'EXACTO-1' })
      await newProduct(org, { name: 'AAA Parecido', sku: 'OTRO-1', barcode: 'exacto-1-bis' })
      expect(await find('exacto-1')).toEqual(['ZZZ Exacto', 'AAA Parecido'])
    })

    it('solo productos activos de la empresa', async () => {
      const names = await find('cola')
      expect(names).not.toContain('Cola vieja (archivada)')
      expect(names).not.toContain('Cola de otra empresa')
    })

    it('trae el stock real de los productos que lo controlan y null de los que no', async () => {
      const [cola, pan, servicio] = await Promise.all([
        invoiceRepository.searchProducts(org, 'COLA-1L', 5),
        invoiceRepository.searchProducts(org, 'PAN-01', 5),
        invoiceRepository.searchProducts(org, 'SERV-01', 5),
      ])
      expect(cola[0]).toMatchObject({ trackStock: true, stock: 8, price: 1190, unit: 'un', barcode: '7801234567890' })
      expect(pan[0]).toMatchObject({ trackStock: true, stock: 3.5, unit: 'kg', barcode: null })
      expect(servicio[0]).toMatchObject({ trackStock: false, stock: null, price: 20000 })
    })

    it('el stock refleja las ventas', async () => {
      const vendible = await newProduct(org, { name: 'Vendible', sku: 'VEND-1', price: 1000, stock: 5 })
      expect((await service().issue(userId, org, input([line(vendible, 2)]))).error).toBe('')
      const [row] = await invoiceRepository.searchProducts(org, 'VEND-1', 5)
      expect(row.stock).toBe(3)
    })

    it('un texto vacío lista productos, respetando el límite', async () => {
      expect(await find('')).toContain('Cola 1L')
      expect(await find('', 2)).toHaveLength(2)
    })

    it('los comodines de LIKE se buscan literalmente', async () => {
      expect(await find('50%')).toEqual(['Descuento 50% Ltda'])
      expect(await find('%')).toEqual(['Descuento 50% Ltda'])
      expect(await find('_')).toEqual([])
    })

    it('otra empresa solo ve lo suyo', async () => {
      expect(await invoiceRepository.searchProducts(other, 'cola', 20)).toHaveLength(1)
    })
  })

  describe('cobros', () => {
    let org = ''
    let other = ''
    let product = ''

    const issueDoc = async (over: Partial<IssueInvoiceInput> = {}, qty = 2) => {
      const result = await service().issue(userId, org, input([line(product, qty)], over))
      expect(result.error).toBe('')
      return result.invoice!.id
    }
    const inv = async (id: string) =>
      (await q<Record<string, unknown>>(
        `select payment_status, paid_total::text as paid_total, paid_at is not null as has_paid_at, status from invoices where id=$1`, [id]))[0]
    const pays = async (id: string) =>
      q<Record<string, unknown>>(
        `select amount::text as amount, method, reference, voided_at is not null as voided, void_reason from invoice_payments where invoice_id=$1 order by created_at, id`, [id])
    const pay = (id: string, amount: number, method: 'cash' | 'transfer' | 'card' | 'other' = 'cash', reference = '', who = org) =>
      service().addPayment(userId, who, { invoiceId: id, amount, method, reference })
    const voidPay = (paymentId: string, reason = 'Error de monto') => service().voidPayment(userId, org, { paymentId, reason })
    const firstPaymentId = async (id: string) => (await q<{ id: string }>(`select id from invoice_payments where invoice_id=$1 and voided_at is null order by created_at, id limit 1`, [id]))[0].id

    // Invariante: lo cobrado siempre es la suma de los pagos vigentes, y el estado sale de compararlo con el total
    const assertConsistent = async (id: string) => {
      const [row] = await q<{ total: string; paid_total: string; payment_status: string; vigentes: string }>(
        `select i.total::text, i.paid_total::text, i.payment_status,
                coalesce((select sum(amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0)::text as vigentes
         from invoices i where i.id=$1`, [id])
      expect(Number(row.paid_total)).toBe(Number(row.vigentes))
      const expected = Number(row.paid_total) >= Number(row.total) ? 'paid' : Number(row.paid_total) <= 0 ? 'unpaid' : 'partial'
      expect(row.payment_status).toBe(expected)
    }

    beforeAll(async () => {
      org = await newOrg()
      other = await newOrg()
      product = await newProduct(org, { price: 1190, stock: 1000 })
    })

    it('cobrado al emitir: queda un pago por el total, con el método elegido', async () => {
      const id = await issueDoc({ paid: true, paymentMethod: 'transfer' })
      expect(await inv(id)).toMatchObject({ payment_status: 'paid', paid_total: '2380.00', has_paid_at: true })
      expect(await pays(id)).toEqual([{ amount: '2380.00', method: 'transfer', reference: null, voided: false, void_reason: null }])
      await assertConsistent(id)
    })

    it('cobrado al emitir sin indicar método: efectivo', async () => {
      const id = await issueDoc({ paid: true })
      expect((await pays(id))[0]).toMatchObject({ method: 'cash' })
    })

    it('sin cobrar al emitir: sin pagos ni total cobrado', async () => {
      const id = await issueDoc()
      expect(await inv(id)).toMatchObject({ payment_status: 'unpaid', paid_total: '0.00', has_paid_at: false })
      expect(await pays(id)).toEqual([])
    })

    it('un documento de total 0 queda pagado, sin pago (no hay nada que cobrar)', async () => {
      const id = (await service().issue(userId, org, input([line(product, 1, { discountValue: 100 })]))).invoice!.id
      expect(await inv(id)).toMatchObject({ payment_status: 'paid', paid_total: '0.00' })
      expect(await pays(id)).toEqual([])
      expect((await pay(id, 10)).error).toBe('El documento ya está pagado')
    })

    it('cobra en varias partes: parcial y luego pagado', async () => {
      const id = await issueDoc()
      const first = await pay(id, 1000, 'cash', ' Caja 1 ')
      expect(first).toEqual({ error: '', success: 'Cobro registrado. Saldo pendiente: $1.380' })
      expect(await inv(id)).toMatchObject({ payment_status: 'partial', paid_total: '1000.00', has_paid_at: false })

      const second = await pay(id, 1380, 'card')
      expect(second).toEqual({ error: '', success: 'Cobro registrado: el documento quedó pagado' })
      expect(await inv(id)).toMatchObject({ payment_status: 'paid', paid_total: '2380.00', has_paid_at: true })
      expect((await pays(id)).map((p) => [p.amount, p.method, p.reference])).toEqual([['1000.00', 'cash', 'Caja 1'], ['1380.00', 'card', null]])
      await assertConsistent(id)
    })

    it('el estado de cobro aparece en la lista, con lo cobrado', async () => {
      const id = await issueDoc()
      await pay(id, 500)
      const page = await service().list(userId, org, { payment: 'partial' })
      expect(page.rows.find((r) => r.id === id)).toMatchObject({ paymentStatus: 'partial', paidTotal: 500, total: 2380 })
    })

    it('no se puede cobrar más que el saldo, y no queda nada escrito', async () => {
      const id = await issueDoc()
      await pay(id, 2000)
      const result = await pay(id, 381)
      expect(result.error).toBe('El monto supera el saldo pendiente ($380)')
      expect(await inv(id)).toMatchObject({ paid_total: '2000.00', payment_status: 'partial' })
      expect(await pays(id)).toHaveLength(1)
    })

    it('un documento saldado no admite más cobros', async () => {
      const id = await issueDoc({ paid: true })
      expect((await pay(id, 1)).error).toBe('El documento ya está pagado')
      expect(await pays(id)).toHaveLength(1)
    })

    it('un monto con decimales en una moneda sin decimales se rechaza', async () => {
      const id = await issueDoc()
      expect((await pay(id, 100.5)).error).toBe('El monto debe ser un número entero')
      expect(await pays(id)).toEqual([])
    })

    it('con moneda de 2 decimales acepta centavos y rechaza fracciones de centavo', async () => {
      const cheap = await newProduct(org, { price: 11.9, stock: 10 })
      settings = { ...settings, currency: 'USD', currencyDecimals: 2 }
      let id = ''
      try {
        id = (await service().issue(userId, org, input([line(cheap, 1)]))).invoice!.id // 11,90 USD
      } finally {
        settings = structuredClone(DEFAULT_BILLING_SETTINGS)
      }
      expect((await pay(id, 5.25)).success).toBe('Cobro registrado. Saldo pendiente: US$6,65')
      expect((await pay(id, 6.655)).error).toBe('El monto admite máximo 2 decimales')
      expect((await pay(id, 6.65)).success).toBe('Cobro registrado: el documento quedó pagado')
      expect(await inv(id)).toMatchObject({ paid_total: '11.90', payment_status: 'paid' })
      await assertConsistent(id)
    })

    it('un documento anulado, inexistente o de otra empresa no se cobra', async () => {
      const voided = await issueDoc()
      await service().voidInvoice(userId, org, { invoiceId: voided, reason: 'Error' })
      expect((await pay(voided, 100)).error).toBe('El documento está anulado')

      expect((await pay(crypto.randomUUID(), 100)).error).toBe('El documento no existe')

      const mine = await issueDoc()
      expect((await pay(mine, 100, 'cash', '', other)).error).toBe('El documento no existe')
      expect(await pays(mine)).toEqual([])
    })

    it('dos cobros simultáneos por el saldo completo: solo uno se registra', async () => {
      const id = await issueDoc()
      const results = await Promise.all([pay(id, 2380), pay(id, 2380)])
      expect(results.filter((r) => r.error === '')).toHaveLength(1)
      expect(results.find((r) => r.error)!.error).toBe('El documento ya está pagado')
      expect(await pays(id)).toHaveLength(1)
      await assertConsistent(id)
    })

    it('anular un cobro devuelve el saldo y guarda quién, cuándo y por qué', async () => {
      const id = await issueDoc()
      await pay(id, 1000)
      await pay(id, 1380) // pagado
      const paymentId = await firstPaymentId(id)

      expect(await voidPay(paymentId, ' Monto mal digitado ')).toEqual({ error: '', success: 'Cobro anulado' })
      expect(await inv(id)).toMatchObject({ payment_status: 'partial', paid_total: '1380.00', has_paid_at: false }) // deja de estar saldado
      const [voided] = await q<Record<string, unknown>>(`select voided_by, void_reason, voided_at is not null as has_date from invoice_payments where id=$1`, [paymentId])
      expect(voided).toEqual({ voided_by: userId, void_reason: 'Monto mal digitado', has_date: true })
      await assertConsistent(id)

      // y se puede volver a cobrar ese saldo
      expect((await pay(id, 1000)).success).toBe('Cobro registrado: el documento quedó pagado')
      await assertConsistent(id)
    })

    it('anular el único cobro deja el documento sin cobrar', async () => {
      const id = await issueDoc({ paid: true })
      expect((await voidPay(await firstPaymentId(id))).error).toBe('')
      expect(await inv(id)).toMatchObject({ payment_status: 'unpaid', paid_total: '0.00' })
    })

    it('un cobro no se anula dos veces, ni dos veces a la vez', async () => {
      const id = await issueDoc()
      await pay(id, 1000)
      const paymentId = await firstPaymentId(id)
      const results = await Promise.all([voidPay(paymentId), voidPay(paymentId)])
      expect(results.filter((r) => r.error === '')).toHaveLength(1)
      expect(results.find((r) => r.error)!.error).toBe('El cobro ya está anulado')
      expect(await inv(id)).toMatchObject({ paid_total: '0.00', payment_status: 'unpaid' })
    })

    it('un cobro inexistente o de otra empresa no se anula', async () => {
      const id = await issueDoc()
      await pay(id, 1000)
      const paymentId = await firstPaymentId(id)
      expect((await voidPay(crypto.randomUUID())).error).toBe('El cobro no existe')
      expect((await service().voidPayment(userId, other, { paymentId, reason: 'Intento' })).error).toBe('El cobro no existe')
      expect(await inv(id)).toMatchObject({ paid_total: '1000.00' })
    })

    it('anular el documento anula sus cobros vigentes y devuelve el stock', async () => {
      const id = await issueDoc()
      await pay(id, 1000)
      await pay(id, 500)
      const stockBefore = await stockOf(org, product)

      expect((await service().voidInvoice(userId, org, { invoiceId: id, reason: 'Documento duplicado' })).error).toBe('')

      expect(await inv(id)).toMatchObject({ status: 'void', payment_status: 'unpaid', paid_total: '0.00', has_paid_at: false })
      const payments = await pays(id)
      expect(payments.every((p) => p.voided)).toBe(true)
      expect(payments.every((p) => p.void_reason === 'Por anulación del documento (Documento duplicado)')).toBe(true)
      expect(await stockOf(org, product)).toBe(stockBefore + 2) // devolvió las 2 unidades
      // ya no se puede anular un cobro suelto de un documento anulado
      const [{ id: paymentId }] = await q<{ id: string }>(`select id from invoice_payments where invoice_id=$1 limit 1`, [id])
      expect((await voidPay(paymentId)).error).toBe('El cobro ya está anulado')
    })

    it('anular un documento con un cobro ya anulado no lo vuelve a tocar', async () => {
      const id = await issueDoc()
      await pay(id, 1000)
      await voidPay(await firstPaymentId(id), 'Primero este')
      await service().voidInvoice(userId, org, { invoiceId: id, reason: 'Luego el documento' })
      expect((await pays(id))[0].void_reason).toBe('Primero este')
    })

    it('mil combinaciones de cobros y anulaciones: lo cobrado siempre es la suma de lo vigente', async () => {
      let seed = 11
      const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
      for (let round = 0; round < 12; round++) {
        const id = await issueDoc({}, 1 + Math.floor(rand() * 5))
        for (let step = 0; step < 14; step++) {
          if (rand() < 0.6) {
            await pay(id, 1 + Math.floor(rand() * 1500), (['cash', 'transfer', 'card', 'other'] as const)[Math.floor(rand() * 4)])
          } else {
            const live = await q<{ id: string }>(`select id from invoice_payments where invoice_id=$1 and voided_at is null`, [id])
            if (live.length) await voidPay(live[Math.floor(rand() * live.length)].id)
          }
          await assertConsistent(id)
        }
      }
    })
  })

  describe('detalle del documento', () => {
    let org = ''
    let other = ''
    let docId = ''
    let customerId = ''

    beforeAll(async () => {
      org = await newOrg()
      other = await newOrg()
      const cola = await newProduct(org, { name: 'Cola 1L', sku: 'COLA', price: 1190, stock: 50 })
      const servicio = await newProduct(org, { name: 'Instalación', sku: 'SERV', price: 20000, track: false })
      customerId = (await customerRepository.create(org, { name: 'Ana Pérez', taxId: '12345678-5', email: 'ana@x.cl', phone: null, address: 'Av. 1', notes: null })).id

      clock = new Date('2026-11-02T15:00:00Z')
      const result = await service().issue(userId, org, input(
        [line(cola, 2, { discountValue: 10 }), line(servicio, 1, { taxRate: 0 }), line(null, 1, { description: 'Flete', unitPrice: 5000 })],
        { customerId, dueDate: '2026-11-05', notes: 'Entregar el lunes' },
      ))
      expect(result.error).toBe('')
      docId = result.invoice!.id
      await service().addPayment(userId, org, { invoiceId: docId, amount: 5000, method: 'transfer', reference: 'T-77' })
      const [first] = await q<{ id: string }>(`select id from invoice_payments where invoice_id=$1`, [docId])
      await service().addPayment(userId, org, { invoiceId: docId, amount: 100, method: 'cash', reference: '' })
      await service().voidPayment(userId, org, { paymentId: (await q<{ id: string }>(`select id from invoice_payments where invoice_id=$1 and amount = 100`, [docId]))[0].id, reason: 'Se cobró de más' })
      void first
      clock = new Date('2026-11-10T15:00:00Z')
    })

    it('trae el documento completo: encabezado, cliente y emisor tal como se emitieron', async () => {
      const result = await service().getDetail(userId, org, docId)
      expect(result!.detail).toMatchObject({
        id: docId, documentType: 'invoice', number: 1, status: 'issued', paymentStatus: 'partial', dueDate: '2026-11-05', overdue: true,
        currency: 'CLP', currencyDecimals: 0, taxName: 'IVA', pricesIncludeTax: true, notes: 'Entregar el lunes', voidReason: null,
        customer: { name: 'Ana Pérez', taxId: '12345678-5', email: 'ana@x.cl', address: 'Av. 1' },
        issuer: { legalName: 'Acme SpA', taxId: '76.000.000-1', address: 'Calle 1' },
      })
      expect(result!.display).toMatchObject({ locale: 'es-CL', timezone: 'America/Santiago' })
    })

    it('las líneas, en orden, con los montos con que se calcularon', async () => {
      const { detail } = (await service().getDetail(userId, org, docId))!
      expect(detail.items.map((i) => [i.position, i.description, i.quantity, i.unitPrice, i.discountValue, i.taxRate])).toEqual([
        [1, 'Cola 1L', 2, 1190, 10, 19],
        [2, 'Instalación', 1, 20000, 0, 0],
        [3, 'Flete', 1, 5000, 0, 19],
      ])
      expect(detail.items[0]).toMatchObject({ sku: 'COLA', unit: 'un', discountType: 'percent', lineGross: 2380, lineDiscount: 238, lineTotal: 2142 })
      expect(detail.items[2]).toMatchObject({ productId: null, sku: null })
    })

    it('los totales cuadran con las líneas, y el saldo con los pagos vigentes', async () => {
      const { detail } = (await service().getDetail(userId, org, docId))!
      const sum = (pick: (i: (typeof detail.items)[number]) => number) => detail.items.reduce((a, i) => a + pick(i), 0)
      expect(detail.total).toBe(sum((i) => i.lineTotal))
      expect(detail.subtotal).toBe(sum((i) => i.lineNet))
      expect(detail.taxTotal).toBe(sum((i) => i.lineTax))
      expect(detail.paidTotal).toBe(5000)
      expect(detail.balance).toBe(detail.total - 5000)
    })

    it('los pagos, del más antiguo al más reciente, con los anulados y su motivo', async () => {
      const { detail } = (await service().getDetail(userId, org, docId))!
      expect(detail.payments.map((p) => [p.amount, p.method, p.reference, p.voidedAt !== null, p.voidReason])).toEqual([
        [5000, 'transfer', 'T-77', false, null],
        [100, 'cash', null, true, 'Se cobró de más'],
      ])
    })

    it('editar el cliente o la empresa después no cambia el documento', async () => {
      await customerRepository.update(org, customerId, { name: 'Otro Nombre', taxId: null, email: null, phone: null, address: null, notes: null })
      await q(`update organizations set legal_name='Cambiada SpA' where id=$1`, [org])
      const { detail } = (await service().getDetail(userId, org, docId))!
      expect(detail.customer?.name).toBe('Ana Pérez')
      expect(detail.issuer.legalName).toBe('Acme SpA')
    })

    it('un documento anulado se muestra con su motivo', async () => {
      const p = await newProduct(org, { price: 1000, stock: 5 })
      const id = (await service().issue(userId, org, input([line(p, 1)]))).invoice!.id
      await service().voidInvoice(userId, org, { invoiceId: id, reason: 'Error de digitación' })
      const { detail } = (await service().getDetail(userId, org, id))!
      expect(detail).toMatchObject({ status: 'void', voidReason: 'Error de digitación', overdue: false })
      expect(detail.voidedAt).not.toBeNull()
    })

    it('un documento de otra empresa o inexistente no se encuentra', async () => {
      expect(await service().getDetail(userId, other, docId)).toBeNull()
      expect(await service().getDetail(userId, org, crypto.randomUUID())).toBeNull()
    })

    it('un borrador no se muestra', async () => {
      const [draft] = await q<{ id: string }>(
        `insert into invoices (organization_id, currency, currency_decimals, tax_name, prices_include_tax) values ($1,'CLP',0,'IVA',true) returning id`, [org])
      expect(await service().getDetail(userId, org, draft.id)).toBeNull()
    })
  })

  describe('impuesto por producto', () => {
    let org = ''
    let libro = ''
    let pan = ''
    let cola = ''

    const items = async (id: string) =>
      q<{ description: string; tax_rate: string; line_net: string; line_tax: string; line_total: string }>(
        `select description, tax_rate::text, line_net::text, line_tax::text, line_total::text from invoice_items where invoice_id=$1 order by position`, [id])
    const invoiceRow = async (id: string) =>
      (await q<{ subtotal: string; tax_total: string; total: string }>(`select subtotal::text, tax_total::text, total::text from invoices where id=$1`, [id]))[0]

    beforeAll(async () => {
      org = await newOrg()
      libro = await newProduct(org, { name: 'Libro', sku: 'LIBRO', price: 5000, taxRate: 0, stock: 100 }) // exento
      pan = await newProduct(org, { name: 'Pan', sku: 'PAN10', price: 1100, taxRate: 10, stock: 100 }) // tasa propia
      cola = await newProduct(org, { name: 'Cola 1L', sku: 'COLA', price: 1190, stock: 100 }) // la de la empresa
    })

    it('un producto exento se emite sin impuesto', async () => {
      const result = await service().issue(userId, org, input([line(libro, 2)]))
      expect(result.error).toBe('')
      const id = result.invoice!.id
      expect(await items(id)).toEqual([{ description: 'Libro', tax_rate: '0.00', line_net: '10000.00', line_tax: '0.00', line_total: '10000.00' }])
      expect(await invoiceRow(id)).toEqual({ subtotal: '10000.00', tax_total: '0.00', total: '10000.00' })
    })

    it('un producto con tasa propia usa esa tasa, no la de la empresa', async () => {
      const id = (await service().issue(userId, org, input([line(pan, 1)]))).invoice!.id
      // 1.100 con 10% incluido: neto 1.000 + impuesto 100
      expect(await items(id)).toEqual([{ description: 'Pan', tax_rate: '10.00', line_net: '1000.00', line_tax: '100.00', line_total: '1100.00' }])
    })

    it('un producto sin tasa propia usa la de la empresa', async () => {
      const id = (await service().issue(userId, org, input([line(cola, 1)]))).invoice!.id
      expect((await items(id))[0]).toMatchObject({ tax_rate: '19.00', line_tax: '190.00' })
    })

    it('un documento mezcla las tres tasas y el desglose cuadra con el total', async () => {
      const id = (await service().issue(userId, org, input([line(libro, 1), line(pan, 1), line(cola, 1), line(null, 1, { description: 'Flete', unitPrice: 5000 })]))).invoice!.id
      expect((await items(id)).map((i) => [i.description, i.tax_rate])).toEqual([['Libro', '0.00'], ['Pan', '10.00'], ['Cola 1L', '19.00'], ['Flete', '19.00']])

      const { detail } = (await service().getDetail(userId, org, id))!
      const byRate = new Map<number, number>()
      for (const item of detail.items) byRate.set(item.taxRate, (byRate.get(item.taxRate) ?? 0) + item.lineTax)
      expect([...byRate.entries()].sort(([a], [b]) => a - b)).toEqual([[0, 0], [10, 100], [19, 190 + 798]])
      expect(detail.taxTotal).toBe(100 + 190 + 798)
      expect(detail.total).toBe(5000 + 1100 + 1190 + 5000)
    })

    it('cambiar la tasa de la empresa no afecta a un producto con tasa propia, pero sí a los demás', async () => {
      settings = { ...settings, taxRate: 21 }
      let id = ''
      try {
        id = (await service().issue(userId, org, input([line(libro, 1), line(pan, 1), line(cola, 1)]))).invoice!.id
      } finally {
        settings = structuredClone(DEFAULT_BILLING_SETTINGS)
      }
      expect((await items(id)).map((i) => i.tax_rate)).toEqual(['0.00', '10.00', '21.00'])
    })

    it('con precios sin impuesto incluido, el exento tampoco suma impuesto y el resto sí', async () => {
      settings = { ...settings, pricesIncludeTax: false }
      let id = ''
      try {
        id = (await service().issue(userId, org, input([line(libro, 1), line(pan, 1)]))).invoice!.id
      } finally {
        settings = structuredClone(DEFAULT_BILLING_SETTINGS)
      }
      expect(await items(id)).toMatchObject([
        { line_net: '5000.00', line_tax: '0.00', line_total: '5000.00' },
        { line_net: '1100.00', line_tax: '110.00', line_total: '1210.00' },
      ])
    })

    it('quien ajusta puede cambiar la tasa de una línea por encima de la del producto', async () => {
      const id = (await service().issue(userId, org, input([line(libro, 1, { taxRate: 19 })]))).invoice!.id
      expect((await items(id))[0]).toMatchObject({ tax_rate: '19.00', line_tax: '798.00' })
    })

    it('editar el impuesto del producto después no cambia los documentos ya emitidos', async () => {
      const id = (await service().issue(userId, org, input([line(libro, 1)]))).invoice!.id
      await q(`update products set tax_rate = 19 where id=$1`, [libro])
      try {
        expect((await items(id))[0]).toMatchObject({ tax_rate: '0.00', line_tax: '0.00' })
        const { detail } = (await service().getDetail(userId, org, id))!
        expect(detail.items[0].taxRate).toBe(0)
        // y el siguiente documento ya usa la tasa nueva
        const next = (await service().issue(userId, org, input([line(libro, 1)]))).invoice!.id
        expect((await items(next))[0].tax_rate).toBe('19.00')
      } finally {
        await q(`update products set tax_rate = 0 where id=$1`, [libro])
      }
    })

    it('si el impuesto del producto cambió mientras se preparaba el documento, no emite', async () => {
      const prepared = (productTaxRate: number | null) => ({
        userId, idempotencyKey: crypto.randomUUID(), documentType: 'invoice' as const, documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes,
        customer: null, issuer: { legalName: null, taxId: null, address: null }, currency: 'CLP', currencyDecimals: 0, taxName: 'IVA',
        pricesIncludeTax: true, allowNegativeStock: false, issuedAt: clock, dueDate: null, paid: false, paymentMethod: 'cash' as const, notes: null,
        totals: { subtotal: 5000, discountTotal: 0, taxTotal: 0, total: 5000 },
        lines: [{ position: 1, productId: libro, sku: 'LIBRO', description: 'Libro', unit: 'un', quantity: 1, unitPrice: 5000, discountType: 'percent' as const,
          discountValue: 0, taxRate: 0, productTaxRate, tracksStock: true, gross: 5000, discount: 0, net: 5000, tax: 0, total: 5000 }],
      })
      const before = (await q<{ c: string }>(`select count(*) c from invoices where organization_id=$1`, [org]))[0].c
      // la base dice 0 (exento), el documento se preparó creyendo que no tenía tasa propia
      expect(await invoiceRepository.issue(org, prepared(null))).toEqual({ status: 'product_changed', productName: 'Libro' })
      // y al revés: se preparó como exento pero ahora el producto tiene tasa propia
      expect(await invoiceRepository.issue(org, prepared(10))).toEqual({ status: 'product_changed', productName: 'Libro' })
      expect((await q<{ c: string }>(`select count(*) c from invoices where organization_id=$1`, [org]))[0].c).toBe(before)
    })

    it('el buscador de productos trae la tasa propia (null, 0 o la tasa)', async () => {
      const find = async (sku: string) => (await invoiceRepository.searchProducts(org, sku, 5))[0].taxRate
      expect(await find('LIBRO')).toBe(0)
      expect(await find('PAN10')).toBe(10)
      expect(await find('COLA')).toBeNull()
    })

    it('la base rechaza una tasa de producto fuera de 0 a 100', async () => {
      await expect(q(`update products set tax_rate = 150 where id=$1`, [pan])).rejects.toThrow(/products_tax_rate_check/)
      await expect(q(`update products set tax_rate = -1 where id=$1`, [pan])).rejects.toThrow(/products_tax_rate_check/)
    })

    it('40 documentos aleatorios con productos de distinta tasa: los montos siempre cuadran', async () => {
      const kinds = await Promise.all(
        [null, 0, 10, 5.5, 19].map((taxRate, i) => newProduct(org, { name: `Mix${i}`, sku: `MIX-${i}`, price: [990, 1190, 2500, 333.33, 19.99][i], taxRate, stock: 100000 })),
      )
      let seed = 3
      const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
      for (let n = 0; n < 40; n++) {
        const lines = Array.from({ length: 1 + Math.floor(rand() * 4) }, () =>
          line(kinds[Math.floor(rand() * kinds.length)], (1 + Math.floor(rand() * 30000)) / 1000, { discountValue: Math.floor(rand() * 3000) / 100 }))
        settings = { ...settings, pricesIncludeTax: rand() < 0.5 }
        const result = await service().issue(userId, org, input(lines))
        expect(result.error, JSON.stringify(lines)).toBe('')
      }
      settings = structuredClone(DEFAULT_BILLING_SETTINGS)

      const bad = await q(`
        select i.id from invoices i join invoice_items l on l.invoice_id = i.id
        where i.organization_id = $1
        group by i.id, i.total, i.subtotal, i.tax_total
        having sum(l.line_total) <> i.total or sum(l.line_net) <> i.subtotal or sum(l.line_tax) <> i.tax_total`, [org])
      expect(bad).toEqual([])
    })
  })
})

