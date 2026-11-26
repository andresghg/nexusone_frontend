// Avisos de cobro contra Postgres real (PGlite): repositorio + servicio, con documentos emitidos por los servicios reales.
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
import { NotificationService } from './NotificationService'
import { notificationRepository } from './NotificationRepository'

const sqlFile = hasPglite
  ? readdirSync(resolve(process.cwd(), 'db/sql')).filter((n) => n.endsWith('.sql')).sort().map((name) => readFileSync(resolve(process.cwd(), 'db/sql', name), 'utf8')).join('\n')
  : ''
const pg = () => holder.pg as Pg
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg().query<T>(text, params)).rows

let userId = ''
let clock = new Date('2026-11-25T15:00:00Z') // 12:00 del 25 de noviembre en Santiago
const settings: BillingSettings = structuredClone(DEFAULT_BILLING_SETTINGS)
const ALL = ['pos.facturacion.read', 'pos.facturacion.create', 'pos.facturacion.void']
const access = (permissions: string[]) => ({
  authorize: async (_u: string, org: string, permission: string) =>
    permissions.includes(permission) ? ({ organizationId: org, role: 'admin', permissions } as never) : null,
})
const invoices = new InvoiceService(invoiceRepository, { find: async () => settings, save: async () => {} }, customerRepository, access(ALL), () => clock)
const notifications = (permissions = ALL) => new NotificationService(notificationRepository, billingSettingsRepository, access(permissions), () => clock)

const newOrg = async (timezone?: string) => {
  const id = (await q<{ id: string }>(
    `insert into organizations(name, slug, legal_name, tax_id, address) values ('Org', $1, 'Acme SpA', '76.000.000-1', 'Calle 1') returning id`,
    [`s-${Math.random().toString(36).slice(2)}`],
  ))[0].id
  if (timezone) await q(`insert into billing_settings(organization_id, timezone) values ($1,$2)`, [id, timezone])
  return id
}
const freeLine = (description: string, unitPrice: number, quantity = 1) => ({
  productId: null, description, unit: 'un', quantity, unitPrice, discountType: 'percent' as const, discountValue: 0, taxRate: null,
})
// Emite un documento de `price` (IVA incluido, sin descuento) y le deja el vencimiento indicado
const issue = async (org: string, price: number, dueDate: string | null, over: { paid?: boolean } = {}) => {
  const result = await invoices.issue(userId, org, {
    documentType: 'invoice', customerId: null, dueDate: null, notes: '', paid: over.paid ?? false,
    idempotencyKey: crypto.randomUUID(), lines: [freeLine('Servicio', price)],
  })
  expect(result.error).toBe('')
  // El sistema no deja emitir con un vencimiento pasado: se fija después, como pasa con el tiempo
  if (dueDate) await q(`update invoices set due_date=$2 where id=$1`, [result.invoice!.id, dueDate])
  return result.invoice!.id
}
const summary = async (org: string, permissions?: string[]) => {
  const result = await notifications(permissions).dueSummary(userId, org)
  if (!result) throw new Error('sin resumen')
  return result
}

describe.skipIf(!hasPglite)('Avisos de cobro contra Postgres real', () => {
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

  it('separa lo vencido (antes de hoy) de lo que vence en los próximos 3 días, hoy incluido', async () => {
    const org = await newOrg()
    await issue(org, 1000, '2026-11-24') // venció ayer → vencida
    await issue(org, 2000, '2026-11-01') // venció hace semanas → vencida
    await issue(org, 3000, '2026-11-25') // vence hoy → por vencer (aún no vencida)
    await issue(org, 4000, '2026-11-27') // en 2 días → por vencer
    await issue(org, 5000, '2026-11-28') // en 3 días → fuera de la ventana
    await issue(org, 6000, null) // sin vencimiento → no cuenta

    expect(await summary(org)).toMatchObject({
      today: '2026-11-25',
      overdue: { documents: 2, amount: 3000 },
      dueSoon: { documents: 2, amount: 7000, nextDueDate: '2026-11-25' },
    })
  })

  it('sin nada pendiente todo queda en cero y sin fecha', async () => {
    const org = await newOrg()
    expect(await summary(org)).toMatchObject({ overdue: { documents: 0, amount: 0 }, dueSoon: { documents: 0, amount: 0, nextDueDate: null } })
  })

  it('lo cobrado completo no avisa, y lo cobrado en parte avisa solo por el saldo', async () => {
    const org = await newOrg()
    await issue(org, 1000, '2026-11-20', { paid: true }) // cobrada al emitir
    const partial = await issue(org, 1000, '2026-11-20')
    expect((await invoices.addPayment(userId, org, { invoiceId: partial, amount: 400, method: 'cash', reference: '' })).error).toBe('')

    expect((await summary(org)).overdue).toEqual({ documents: 1, amount: 600 })
  })

  it('un documento anulado no avisa', async () => {
    const org = await newOrg()
    const id = await issue(org, 1000, '2026-11-20')
    await issue(org, 500, '2026-11-20')
    expect((await invoices.voidInvoice(userId, org, { invoiceId: id, reason: 'Duplicada' })).error).toBe('')

    expect((await summary(org)).overdue).toEqual({ documents: 1, amount: 500 })
  })

  it('una nota de crédito reduce el saldo y, si acredita todo, el documento deja de avisar', async () => {
    const org = await newOrg()
    const half = await issue(org, 1000, '2026-11-20')
    const full = await issue(org, 2000, '2026-11-20')
    const itemOf = async (id: string) => (await q<{ id: string }>(`select id from invoice_items where invoice_id=$1 and position=1`, [id]))[0].id
    const credit = async (id: string, quantity: number) =>
      invoices.issueCreditNote(userId, org, {
        invoiceId: id, reason: 'Devolución', idempotencyKey: crypto.randomUUID(), lines: [{ itemId: await itemOf(id), quantity, restock: false }],
      })
    expect((await credit(half, 0.5)).error).toBe('')
    expect((await credit(full, 1)).error).toBe('')

    // la nota en sí no cuenta como documento por cobrar; "half" debe 500 y "full" nada
    expect((await summary(org)).overdue).toEqual({ documents: 1, amount: 500 })
  })

  it('cada empresa ve solo lo suyo', async () => {
    const a = await newOrg()
    const b = await newOrg()
    await issue(a, 1000, '2026-11-20')
    await issue(b, 7000, '2026-11-20')
    await issue(b, 8000, '2026-11-20')
    expect((await summary(a)).overdue).toEqual({ documents: 1, amount: 1000 })
    expect((await summary(b)).overdue).toEqual({ documents: 2, amount: 15000 })
  })

  it('el "hoy" es el de la empresa: a las 23:30 de Santiago un documento que vence hoy sigue siendo "por vencer"', async () => {
    const org = await newOrg('America/Santiago')
    await q(`update billing_settings set timezone='America/Santiago' where organization_id=$1`, [org])
    await issue(org, 1000, '2026-11-25')
    clock = new Date('2026-11-26T02:30:00Z') // 23:30 del 25 en Santiago, pero ya 26 en UTC
    try {
      const result = await summary(org)
      expect(result.today).toBe('2026-11-25')
      expect(result.overdue.documents).toBe(0)
      expect(result.dueSoon.documents).toBe(1)
      clock = new Date('2026-11-26T04:00:00Z') // 01:00 del 26 en Santiago: ahora sí venció
      expect((await summary(org)).overdue.documents).toBe(1)
    } finally {
      clock = new Date('2026-11-25T15:00:00Z')
    }
  })

  it('sin permiso de facturación no hay resumen', async () => {
    const org = await newOrg()
    await issue(org, 1000, '2026-11-20')
    expect(await notifications(['pos.inventario.read']).dueSummary(userId, org)).toBeNull()
  })

  it('el número de la campana coincide con el filtro "vencidas" de la lista de facturación', async () => {
    const org = await newOrg()
    await issue(org, 1000, '2026-11-20')
    const half = await issue(org, 1000, '2026-11-19')
    await invoices.addPayment(userId, org, { invoiceId: half, amount: 300, method: 'cash', reference: '' })
    await issue(org, 1000, '2026-11-26')

    const list = await invoices.list(userId, org, { payment: 'overdue' })
    expect(list.total).toBe(2)
    expect(list.total).toBe((await summary(org)).overdue.documents)
  })
})
