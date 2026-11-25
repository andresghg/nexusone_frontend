// Impuesto en lote contra Postgres real (PGlite): repositorio + servicio + su efecto al facturar.
// Se salta solo si @electric-sql/pglite no está instalado. Limitación: una sola conexión, así que la carrera
// real entre dos cambios simultáneos (filas bloqueadas con FOR UPDATE) se prueba en el entorno real.
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
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '@/features/billing/types/billing'
import { InvoiceService } from '@/features/billing/services/InvoiceService'
import { invoiceRepository } from '@/features/billing/services/InvoiceRepository'
import { ProductService } from './ProductService'
import { productRepository } from './ProductRepository'

const sqlFile = hasPglite
  ? readdirSync(resolve(process.cwd(), 'db/sql')).filter((n) => n.endsWith('.sql')).sort().map((name) => readFileSync(resolve(process.cwd(), 'db/sql', name), 'utf8')).join('\n')
  : ''
const pg = () => holder.pg as Pg
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg().query<T>(text, params)).rows

let userId = ''
const settings: BillingSettings = structuredClone(DEFAULT_BILLING_SETTINGS)
const accessWith = (permissions: string[]) => ({
  authorize: async (_u: string, org: string, permission: string) =>
    permissions.includes(permission) ? ({ organizationId: org, role: 'admin', permissions } as never) : null,
})
const products = (permissions = ['pos.inventario.read', 'pos.inventario.write']) =>
  new ProductService(productRepository, accessWith(permissions))
const invoices = () =>
  new InvoiceService(invoiceRepository, { find: async () => settings, save: async () => {} }, customerRepository,
    accessWith(['pos.facturacion.read', 'pos.facturacion.create']), () => new Date('2026-11-10T15:00:00Z'))

const newOrg = async () =>
  (await q<{ id: string }>(`insert into organizations(name, slug, legal_name, tax_id, address) values ('Org', $1, 'Acme SpA', '76.000.000-1', 'Calle 1') returning id`,
    [`s-${Math.random().toString(36).slice(2)}`]))[0].id
const newCategory = async (org: string, name: string) =>
  (await q<{ id: string }>(`insert into product_categories(organization_id, name) values ($1,$2) returning id`, [org, name]))[0].id
const newProduct = async (org: string, name: string, o: { category?: string; tax?: string | null; active?: boolean; stock?: number; min?: number; price?: number } = {}) => {
  const id = (await q<{ id: string }>(
    `insert into products(organization_id, category_id, sku, name, unit, price, tax_rate, active, min_stock, track_stock)
     values ($1,$2,$3,$4,'un',$5,$6,$7,$8,true) returning id`,
    [org, o.category ?? null, `SKU-${Math.random().toString(36).slice(2, 8)}`, name, o.price ?? 1190, o.tax ?? null, o.active ?? true, o.min ?? 0],
  ))[0].id
  if (o.stock) await q(`insert into stock_movements(organization_id, product_id, type, delta) values ($1,$2,'in',$3)`, [org, id, o.stock])
  return id
}
const taxOf = async (id: string) => (await q<{ tax_rate: string | null }>(`select tax_rate from products where id=$1`, [id]))[0].tax_rate
const updatedAt = async (id: string) => (await q<{ u: string }>(`select updated_at::text u from products where id=$1`, [id]))[0].u

const bulk = (org: string, filters: object, taxRate: string, expectedCount: number, permissions?: string[]) =>
  products(permissions).setTaxRateInBulk(userId, org, { filters: { status: 'active', ...filters }, taxRate, expectedCount })

describe.skipIf(!hasPglite)('Impuesto en lote contra Postgres real', () => {
  beforeAll(async () => {
    const { PGlite } = pgliteModule!
    const { drizzle } = await import('drizzle-orm/pglite')
    const client = new PGlite()
    await client.exec(`
      create schema auth; create table auth.users (id uuid primary key default gen_random_uuid());
      create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, owner_user_id uuid,
        legal_name text, tax_id text, business_activity text, address text, commune text, region text, phone text, contact_email text,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      create table public.product_categories (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
        name text not null, created_at timestamptz not null default now(), unique (organization_id, id), unique (organization_id, name));
      create table public.products (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
        category_id uuid, sku text not null, barcode text, name text not null, description text, unit text not null default 'un',
        price numeric(14,2) not null default 0, cost numeric(14,2) not null default 0, min_stock numeric(14,3) not null default 0,
        track_stock boolean not null default true, active boolean not null default true,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        unique (organization_id, id), unique (organization_id, sku),
        foreign key (organization_id, category_id) references public.product_categories(organization_id, id));
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

  it('por categoría: cambia solo los productos de esa categoría y deja el resto como estaba', async () => {
    const org = await newOrg()
    const libros = await newCategory(org, 'Libros')
    const bebidas = await newCategory(org, 'Bebidas')
    const l1 = await newProduct(org, 'Novela', { category: libros })
    const l2 = await newProduct(org, 'Cuento', { category: libros, tax: '10.00' })
    const b1 = await newProduct(org, 'Cola', { category: bebidas, tax: '5.00' })
    const sin = await newProduct(org, 'Suelto')

    const result = await bulk(org, { categoryId: libros }, '0', 2)
    expect(result).toEqual({ error: '', success: 'Impuesto actualizado: 2 productos quedaron exentos' })
    expect(await taxOf(l1)).toBe('0.00')
    expect(await taxOf(l2)).toBe('0.00')
    expect(await taxOf(b1)).toBe('5.00')
    expect(await taxOf(sin)).toBeNull()
  })

  it('por búsqueda: nombre, SKU o código, sin distinguir mayúsculas, y los comodines se buscan literalmente', async () => {
    const org = await newOrg()
    const a = await newProduct(org, 'Pan de molde')
    const b = await newProduct(org, 'Pan integral')
    const c = await newProduct(org, 'Leche 50% descremada')
    const d = await newProduct(org, 'Leche entera')
    expect((await bulk(org, { search: 'PAN' }, '0', 2)).error).toBe('')
    expect([await taxOf(a), await taxOf(b), await taxOf(c), await taxOf(d)]).toEqual(['0.00', '0.00', null, null])
    expect((await bulk(org, { search: '50%' }, '0', 1)).error).toBe('') // el % no es comodín
    expect(await taxOf(c)).toBe('0.00')
    expect(await taxOf(d)).toBeNull()
  })

  it('respeta el estado de la lista: activos por defecto, archivados o todos', async () => {
    const org = await newOrg()
    const activo = await newProduct(org, 'Activo')
    const archivado = await newProduct(org, 'Archivado', { active: false })

    expect((await bulk(org, {}, '0', 1)).error).toBe('')
    expect([await taxOf(activo), await taxOf(archivado)]).toEqual(['0.00', null])
    expect((await bulk(org, { status: 'archived' }, '19', 1)).error).toBe('')
    expect([await taxOf(activo), await taxOf(archivado)]).toEqual(['0.00', '19.00'])
    expect((await bulk(org, { status: 'all' }, '', 2)).success).toBe('Impuesto actualizado: 2 productos usan la tasa de la empresa')
    expect([await taxOf(activo), await taxOf(archivado)]).toEqual([null, null])
  })

  it('con "stock bajo" cambia exactamente los que la lista muestra como bajos', async () => {
    const org = await newOrg()
    const bajo = await newProduct(org, 'Bajo', { stock: 2, min: 5 })
    const justo = await newProduct(org, 'Justo', { stock: 5, min: 5 })
    const ok = await newProduct(org, 'Sobra', { stock: 20, min: 5 })
    expect((await bulk(org, { lowStock: true }, '0', 2)).error).toBe('')
    expect([await taxOf(bajo), await taxOf(justo), await taxOf(ok)]).toEqual(['0.00', '0.00', null])
  })

  it('no toca productos de otra empresa, ni con la misma búsqueda', async () => {
    const orgA = await newOrg()
    const orgB = await newOrg()
    const a = await newProduct(orgA, 'Pan')
    const b = await newProduct(orgB, 'Pan')
    expect((await bulk(orgA, { search: 'pan' }, '0', 1)).error).toBe('')
    expect(await taxOf(a)).toBe('0.00')
    expect(await taxOf(b)).toBeNull()
    // una categoría de otra empresa no existe para esta
    const foreign = await newCategory(orgB, 'Ajena')
    expect((await bulk(orgA, { categoryId: foreign }, '0', 1)).error).toBe('La categoría no existe')
  })

  it('si la lista no tiene el total confirmado no cambia nada (y no deja cambios a medias)', async () => {
    const org = await newOrg()
    const a = await newProduct(org, 'Uno', { tax: '5.00' })
    const b = await newProduct(org, 'Dos', { tax: '5.00' })
    const before = await updatedAt(a)

    const tooFew = await bulk(org, {}, '0', 3)
    expect(tooFew.error).toBe('La lista cambió: ahora tiene 2 productos y habías confirmado 3. Revísala y vuelve a intentarlo')
    const tooMany = await bulk(org, {}, '0', 1)
    expect(tooMany.error).toContain('ahora tiene 2 productos y habías confirmado 1')
    expect([await taxOf(a), await taxOf(b)]).toEqual(['5.00', '5.00'])
    expect(await updatedAt(a)).toBe(before)
  })

  it('una lista vacía no cambia nada', async () => {
    const org = await newOrg()
    await newProduct(org, 'Uno')
    const result = await bulk(org, { search: 'no existe' }, '0', 1)
    expect(result.error).toContain('ahora tiene 0 productos')
  })

  it('guarda cada valor como corresponde: vacío = tasa de la empresa, 0 = exento, otra tasa con 2 decimales', async () => {
    const org = await newOrg()
    const id = await newProduct(org, 'Uno')
    for (const [input, saved] of [['0', '0.00'], ['19,5', '19.50'], ['100', '100.00'], ['', null]] as const) {
      expect((await bulk(org, {}, input, 1)).error).toBe('')
      expect(await taxOf(id)).toBe(saved)
    }
  })

  it('sin permiso de escritura no cambia nada', async () => {
    const org = await newOrg()
    const id = await newProduct(org, 'Uno')
    expect((await bulk(org, {}, '0', 1, ['pos.inventario.read'])).error).toBe('No tienes permisos para modificar el inventario')
    expect(await taxOf(id)).toBeNull()
  })

  it('marca la fecha de actualización solo de los productos cambiados', async () => {
    const org = await newOrg()
    const libros = await newCategory(org, 'Libros')
    const a = await newProduct(org, 'Novela', { category: libros })
    const b = await newProduct(org, 'Otro')
    await q(`update products set updated_at = '2020-01-01T00:00:00Z' where organization_id=$1`, [org])
    await bulk(org, { categoryId: libros }, '0', 1)
    expect((await updatedAt(a)).startsWith('2020')).toBe(false)
    expect((await updatedAt(b)).startsWith('2020')).toBe(true)
  })

  it('al facturar, los productos cambiados salen con su nueva tasa y el resto con la de la empresa', async () => {
    const org = await newOrg()
    const libros = await newCategory(org, 'Libros')
    const libro = await newProduct(org, 'Novela', { category: libros, price: 10000, stock: 5 })
    const cola = await newProduct(org, 'Cola', { price: 1190, stock: 5 })
    const issue = async () => {
      const result = await invoices().issue(userId, org, {
        documentType: 'invoice', customerId: null, dueDate: null, notes: '', paid: false, idempotencyKey: crypto.randomUUID(),
        lines: [libro, cola].map((productId) => ({ productId, description: '', unit: '', quantity: 1, unitPrice: 0, discountType: 'percent' as const, discountValue: 0, taxRate: null })),
      })
      expect(result.error).toBe('')
      return (await q<{ tax_total: string; total: string }>(`select tax_total, total from invoices where id=$1`, [result.invoice!.id]))[0]
    }

    expect(await issue()).toEqual({ tax_total: String((10000 - Math.round(10000 / 1.19) + 190).toFixed(2)), total: '11190.00' }) // todo con IVA 19 %
    await bulk(org, { categoryId: libros }, '0', 1)
    expect(await issue()).toEqual({ tax_total: '190.00', total: '11190.00' }) // el libro, exento: solo la cola paga IVA
    await bulk(org, { categoryId: libros }, '', 1)
    expect((await issue()).tax_total).toBe(String((10000 - Math.round(10000 / 1.19) + 190).toFixed(2))) // vuelve a la tasa de la empresa
  })

  it('los documentos ya emitidos no cambian cuando cambia el impuesto de un producto', async () => {
    const org = await newOrg()
    const libro = await newProduct(org, 'Novela', { price: 10000, stock: 5 })
    const result = await invoices().issue(userId, org, {
      documentType: 'invoice', customerId: null, dueDate: null, notes: '', paid: false, idempotencyKey: crypto.randomUUID(),
      lines: [{ productId: libro, description: '', unit: '', quantity: 1, unitPrice: 0, discountType: 'percent', discountValue: 0, taxRate: null }],
    })
    const before = (await q(`select tax_total, total from invoices where id=$1`, [result.invoice!.id]))[0]
    await bulk(org, {}, '0', 1)
    expect((await q(`select tax_total, total from invoices where id=$1`, [result.invoice!.id]))[0]).toEqual(before)
    expect((await q<{ tax_rate: string }>(`select tax_rate from invoice_items where invoice_id=$1`, [result.invoice!.id]))[0].tax_rate).toBe('19.00')
  })
})
