import { describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/types/navigation'
import type { IAccessResolver } from '@/features/organization/services/AccessService'
import type { IBillingSettingsRepository } from '@/features/billing/services/BillingSettingsRepository'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '@/features/billing/types/billing'
import type { AgingRow, Debtor, SalesBucketRow, TopProduct } from '../types/report'
import { ReportService, TOP_PRODUCTS_DEFAULT, TOP_PRODUCTS_MAX } from './ReportService'
import type { IReportRepository } from './ReportRepository'

const ORG = 'org-1'
const OTHER_ORG = 'org-2'
const NOON_SANTIAGO = new Date('2026-11-23T15:00:00Z') // 2026-11-23 12:00 en Santiago (UTC-3)

const bucket = (over: Partial<SalesBucketRow> = {}): SalesBucketRow => ({
  bucket: '2026-11-23', documents: 0, invoicedTotal: 0, invoicedSubtotal: 0, creditNotes: 0, creditedTotal: 0, creditedSubtotal: 0, ...over,
})
const aging = (over: Partial<Record<AgingRow['bucket'], [number, number]>> = {}): AgingRow[] =>
  (['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const).map((name) => ({
    bucket: name, documents: over[name]?.[0] ?? 0, amount: over[name]?.[1] ?? 0,
  }))

function setup({
  granted = ['finanzas.reportes.read', 'pos.facturacion.read'] as Permission[],
  settings = null as BillingSettings | null,
  now = NOON_SANTIAGO,
  buckets = [] as SalesBucketRow[],
  collected = 0,
  products = [] as TopProduct[],
  receivables = { aging: aging(), debtors: [] as Debtor[] },
} = {}) {
  const repo = {
    salesBuckets: vi.fn().mockResolvedValue(buckets),
    collected: vi.fn().mockResolvedValue(collected),
    topProducts: vi.fn().mockResolvedValue(products),
    receivables: vi.fn().mockResolvedValue(receivables),
  } satisfies IReportRepository
  const settingsRepo = { find: vi.fn().mockResolvedValue(settings), save: vi.fn() } satisfies IBillingSettingsRepository
  const access = {
    authorize: vi.fn(async (_u: string, org: string, permission: Permission) =>
      org === ORG && granted.includes(permission) ? { organizationId: ORG, role: 'admin', permissions: granted } : null,
    ),
  } satisfies IAccessResolver
  return { repo, settingsRepo, access, service: new ReportService(repo, settingsRepo, access, () => now) }
}

const usd: BillingSettings = { ...structuredClone(DEFAULT_BILLING_SETTINGS), currency: 'USD', currencyDecimals: 2, locale: 'en-US', timezone: 'America/New_York' }

describe('ReportService · permisos', () => {
  const range = { from: '2026-11-01', to: '2026-11-23' }

  it.each([
    ['ventas', (s: ReportService) => s.sales('u1', ORG, range)],
    ['productos', (s: ReportService) => s.topProducts('u1', ORG, range)],
    ['cuentas por cobrar', (s: ReportService) => s.receivables('u1', ORG)],
  ])('%s: exige el permiso de reportes (el de facturación no basta)', async (_name, call) => {
    const { repo, service } = setup({ granted: ['pos.facturacion.read'] })
    expect(await call(service)).toEqual({ error: 'No tienes permisos para ver los reportes' })
    expect(Object.values(repo).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })

  it.each([
    ['ventas', (s: ReportService) => s.sales('u1', OTHER_ORG, range)],
    ['productos', (s: ReportService) => s.topProducts('u1', OTHER_ORG, range)],
    ['cuentas por cobrar', (s: ReportService) => s.receivables('u1', OTHER_ORG)],
  ])('%s: no sale de la empresa a la que pertenece', async (_name, call) => {
    const { repo, service } = setup()
    expect(await call(service)).toEqual({ error: 'No tienes permisos para ver los reportes' })
    expect(Object.values(repo).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })

  it('el panel lo ve quien puede ver facturación, sin necesitar el permiso de reportes', async () => {
    expect(await setup({ granted: ['pos.facturacion.read'] }).service.dashboard('u1', ORG)).not.toBeNull()
  })

  it('el panel no lo ve quien solo tiene reportes, ni otra empresa', async () => {
    expect(await setup({ granted: ['finanzas.reportes.read'] }).service.dashboard('u1', ORG)).toBeNull()
    expect(await setup().service.dashboard('u1', OTHER_ORG)).toBeNull()
  })
})

describe('ReportService.sales', () => {
  it('rechaza rangos inválidos sin consultar la base', async () => {
    const { repo, service } = setup()
    expect(await service.sales('u1', ORG, { from: '2026-11-30', to: '2026-11-01' })).toEqual({ error: 'La fecha de inicio no puede ser posterior a la de término' })
    expect(await service.sales('u1', ORG, { from: '2026-02-30', to: '2026-03-01' })).toEqual({ error: 'Las fechas deben ser reales, en formato AAAA-MM-DD' })
    expect(await service.sales('u1', ORG, { from: '2025-01-01', to: '2026-01-02' })).toEqual({ error: 'El rango máximo es de un año' })
    expect(repo.salesBuckets).not.toHaveBeenCalled()
  })

  it('consulta con la zona horaria de la empresa y por día en rangos cortos', async () => {
    const { repo, service } = setup({ settings: usd })
    const result = await service.sales('u1', ORG, { from: '2026-11-01', to: '2026-11-30' })
    expect(repo.salesBuckets).toHaveBeenCalledWith(ORG, { from: '2026-11-01', to: '2026-11-30' }, 'America/New_York', 'day')
    expect(repo.collected).toHaveBeenCalledWith(ORG, { from: '2026-11-01', to: '2026-11-30' }, 'America/New_York')
    expect('report' in result && result.report.granularity).toBe('day')
  })

  it('por mes en rangos largos', async () => {
    const { repo, service } = setup()
    const result = await service.sales('u1', ORG, { from: '2026-01-01', to: '2026-11-23' })
    expect(repo.salesBuckets.mock.calls[0][3]).toBe('month')
    expect('report' in result && result.report.points).toHaveLength(11)
  })

  it('devuelve un punto por período (también los vacíos), con neto y totales', async () => {
    const { service } = setup({
      buckets: [
        bucket({ bucket: '2026-11-01', documents: 2, invoicedTotal: 3570, invoicedSubtotal: 3000 }),
        bucket({ bucket: '2026-11-03', documents: 1, invoicedTotal: 1190, invoicedSubtotal: 1000, creditNotes: 1, creditedTotal: 595, creditedSubtotal: 500 }),
      ],
      collected: 2000,
    })
    const result = await service.sales('u1', ORG, { from: '2026-11-01', to: '2026-11-03' })
    if (!('report' in result)) throw new Error(result.error)
    expect(result.report.points.map((p) => [p.bucket, p.documents, p.netTotal])).toEqual([
      ['2026-11-01', 2, 3570],
      ['2026-11-02', 0, 0],
      ['2026-11-03', 1, 595],
    ])
    expect(result.report.totals).toMatchObject({ documents: 3, netTotal: 4165, netSubtotal: 3500, netTax: 665, collected: 2000 })
    expect(result.report.display).toEqual({ currency: 'CLP', currencyDecimals: 0, locale: 'es-CL', timezone: 'America/Santiago' })
  })

  it('usa los decimales y la moneda de la empresa', async () => {
    const { service } = setup({ settings: usd, buckets: [bucket({ documents: 3, invoicedTotal: 10.1, invoicedSubtotal: 10.1, creditedTotal: 0.2, creditedSubtotal: 0.2 })] })
    const result = await service.sales('u1', ORG, { from: '2026-11-23', to: '2026-11-23' })
    if (!('report' in result)) throw new Error(result.error)
    expect(result.report.totals).toMatchObject({ netTotal: 9.9, averageTicket: 3.37 })
    expect(result.report.display.currency).toBe('USD')
  })
})

describe('ReportService.topProducts', () => {
  const range = { from: '2026-11-01', to: '2026-11-23' }
  const call = async (input: object = {}) => {
    const ctx = setup()
    await ctx.service.topProducts('u1', ORG, { ...range, ...input })
    return ctx.repo.topProducts.mock.calls[0]
  }

  it('por defecto ordena por importe y trae 10', async () => {
    expect(await call()).toEqual([ORG, range, 'America/Santiago', 'revenue', TOP_PRODUCTS_DEFAULT])
  })

  it('se puede ordenar por cantidad; cualquier otro valor cae en importe', async () => {
    expect((await call({ rank: 'quantity' }))[3]).toBe('quantity')
    expect((await call({ rank: 'otra' }))[3]).toBe('revenue')
  })

  it.each([
    [undefined, TOP_PRODUCTS_DEFAULT],
    [0, TOP_PRODUCTS_DEFAULT],
    [NaN, TOP_PRODUCTS_DEFAULT],
    [5, 5],
    [2.9, 2],
    [-5, 1],
    [1000, TOP_PRODUCTS_MAX],
  ])('límite %s → %i', async (limit, expected) => {
    expect((await call({ limit }))[4]).toBe(expected)
  })

  it('valida el rango antes de consultar', async () => {
    const { repo, service } = setup()
    expect(await service.topProducts('u1', ORG, { from: '2026-12-01', to: '2026-11-01' })).toEqual({
      error: 'La fecha de inicio no puede ser posterior a la de término',
    })
    expect(repo.topProducts).not.toHaveBeenCalled()
  })

  it('devuelve lo que entrega la base con la moneda de la empresa', async () => {
    const products: TopProduct[] = [{ productId: 'p1', sku: 'COLA', description: 'Cola', unit: 'un', quantity: 3, total: 3570, net: 3000 }]
    const result = await setup({ products }).service.topProducts('u1', ORG, range)
    expect(result).toMatchObject({ report: { range, rank: 'revenue', products, display: { currency: 'CLP' } } })
  })
})

describe('ReportService.receivables', () => {
  it('calcula el atraso con el "hoy" de la empresa, no el de UTC', async () => {
    // 02:00 UTC del 23 de noviembre sigue siendo el 22 en Santiago
    const { repo, service } = setup({ now: new Date('2026-11-23T02:00:00Z') })
    const result = await service.receivables('u1', ORG)
    expect(repo.receivables).toHaveBeenCalledWith(ORG, '2026-11-22', 10)
    expect('report' in result && result.report.asOf).toBe('2026-11-22')
  })

  it('suma lo que se debe y lo vencido, sin contar lo que está al día como vencido', async () => {
    const { service } = setup({
      receivables: {
        aging: aging({ current: [2, 5000], d1_30: [1, 1190], d31_60: [1, 2380], d90_plus: [1, 500] }),
        debtors: [],
      },
    })
    const result = await service.receivables('u1', ORG)
    if (!('report' in result)) throw new Error(result.error)
    expect(result.report).toMatchObject({ documents: 5, total: 9070, overdueDocuments: 3, overdue: 4070 })
    expect(result.report.aging.map((row) => row.bucket)).toEqual(['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'])
    expect(result.report.aging[3]).toEqual({ bucket: 'd61_90', documents: 0, amount: 0 })
  })

  it('los deudores sin nombre se muestran como consumidor final', async () => {
    const debtors: Debtor[] = [
      { customerId: 'c1', name: '  Ana Pérez ', documents: 2, amount: 3000, oldestDueDate: '2026-10-01' },
      { customerId: null, name: '', documents: 1, amount: 500, oldestDueDate: null },
      { customerId: null, name: '   ', documents: 1, amount: 100, oldestDueDate: null },
    ]
    const result = await setup({ receivables: { aging: aging(), debtors } }).service.receivables('u1', ORG)
    if (!('report' in result)) throw new Error(result.error)
    expect(result.report.debtors.map((d) => d.name)).toEqual(['Ana Pérez', 'Consumidor final', 'Consumidor final'])
  })

  it('sin deudas todo es cero', async () => {
    const result = await setup().service.receivables('u1', ORG)
    expect(result).toMatchObject({ report: { documents: 0, total: 0, overdue: 0, overdueDocuments: 0, debtors: [] } })
  })
})

describe('ReportService.dashboard', () => {
  it('arma hoy, ayer, la semana y el mes desde un solo recorrido por día', async () => {
    // Lunes 23 de noviembre: semana = 17..23, mes = 1..23
    const buckets = [
      bucket({ bucket: '2026-11-01', documents: 5, invoicedTotal: 5000, invoicedSubtotal: 4000 }),
      bucket({ bucket: '2026-11-16', documents: 9, invoicedTotal: 9000, invoicedSubtotal: 7000 }), // antes de la semana
      bucket({ bucket: '2026-11-17', documents: 1, invoicedTotal: 100, invoicedSubtotal: 80 }),
      bucket({ bucket: '2026-11-22', documents: 2, invoicedTotal: 2000, invoicedSubtotal: 1600, creditNotes: 1, creditedTotal: 500, creditedSubtotal: 400 }),
      bucket({ bucket: '2026-11-23', documents: 3, invoicedTotal: 3000, invoicedSubtotal: 2400 }),
    ]
    const { repo, service } = setup({ buckets, receivables: { aging: aging({ current: [1, 700], d1_30: [1, 300] }), debtors: [] } })
    const summary = await service.dashboard('u1', ORG)

    expect(repo.salesBuckets).toHaveBeenCalledTimes(1)
    expect(repo.salesBuckets).toHaveBeenCalledWith(ORG, { from: '2026-11-01', to: '2026-11-23' }, 'America/Santiago', 'day')
    expect(summary).toMatchObject({
      asOf: '2026-11-23',
      today: { netTotal: 3000, documents: 3 },
      yesterday: { netTotal: 1500 }, // 2.000 facturado − 500 acreditado
      week: { documents: 6 }, // 17: 1, 22: 2, 23: 3
      month: { netTotal: 18600, documents: 20, averageTicket: Math.round(19100 / 20) },
      receivables: { total: 1000, overdue: 300 },
    })
  })

  it('a comienzos de mes la semana cruza el mes anterior pero el mes solo cuenta el actual', async () => {
    // Martes 3 de noviembre: semana = 28 oct .. 3 nov, mes = 1..3 nov
    const buckets = [
      bucket({ bucket: '2026-10-28', documents: 4, invoicedTotal: 4000, invoicedSubtotal: 3000 }),
      bucket({ bucket: '2026-11-02', documents: 1, invoicedTotal: 1000, invoicedSubtotal: 800 }),
      bucket({ bucket: '2026-11-03', documents: 2, invoicedTotal: 2000, invoicedSubtotal: 1600 }),
    ]
    const { repo, service } = setup({ now: new Date('2026-11-03T15:00:00Z'), buckets })
    const summary = await service.dashboard('u1', ORG)
    expect(repo.salesBuckets.mock.calls[0][1]).toEqual({ from: '2026-10-28', to: '2026-11-03' })
    expect(summary?.week.documents).toBe(7) // incluye octubre
    expect(summary?.month).toMatchObject({ documents: 3, netTotal: 3000 }) // no incluye octubre
    expect(summary?.today.netTotal).toBe(2000)
    expect(summary?.yesterday.netTotal).toBe(1000)
  })

  it('el día 1 "ayer" es el último día del mes anterior', async () => {
    const buckets = [bucket({ bucket: '2026-10-31', documents: 1, invoicedTotal: 700, invoicedSubtotal: 600 })]
    const { repo, service } = setup({ now: new Date('2026-11-01T15:00:00Z'), buckets })
    const summary = await service.dashboard('u1', ORG)
    expect(repo.salesBuckets.mock.calls[0][1]).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(summary?.yesterday.netTotal).toBe(700)
    expect(summary?.month.documents).toBe(0)
  })

  it('sin ventas: ceros, sin dividir por cero', async () => {
    const summary = await setup().service.dashboard('u1', ORG)
    expect(summary).toMatchObject({
      today: { netTotal: 0, documents: 0 }, yesterday: { netTotal: 0 }, week: { documents: 0 },
      month: { netTotal: 0, documents: 0, averageTicket: 0 }, receivables: { total: 0, overdue: 0 },
    })
  })

  it('usa la zona horaria de la empresa para saber qué es "hoy"', async () => {
    // 02:00 UTC del 23: en Santiago aún es 22
    const { repo, service } = setup({ now: new Date('2026-11-23T02:00:00Z') })
    await service.dashboard('u1', ORG)
    expect(repo.salesBuckets.mock.calls[0][1].to).toBe('2026-11-22')
  })
})

describe('ReportService.context', () => {
  it('da el formato de la empresa y su "hoy", no el de UTC', async () => {
    const { service } = setup({ settings: usd, now: new Date('2026-11-23T03:30:00Z') }) // 22:30 del 22 en Nueva York
    expect(await service.context('u1', ORG)).toEqual({
      display: { currency: 'USD', currencyDecimals: 2, locale: 'en-US', timezone: 'America/New_York' },
      today: '2026-11-22',
    })
  })

  it('exige el permiso de reportes y no sale de la empresa', async () => {
    expect(await setup({ granted: ['pos.facturacion.read'] }).service.context('u1', ORG)).toBeNull()
    expect(await setup().service.context('u1', OTHER_ORG)).toBeNull()
  })
})
