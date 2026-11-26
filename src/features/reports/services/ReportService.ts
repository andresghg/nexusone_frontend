import { billingSettingsRepository, type IBillingSettingsRepository } from '@/features/billing/services/BillingSettingsRepository'
import { DEFAULT_BILLING_SETTINGS, PAYMENT_METHODS, type DisplayFormat, type PaymentMethod } from '@/features/billing/types/billing'
import { addDays, todayInTimezone } from '@/features/billing/utils/dates'
import { accessService, type IAccessResolver } from '@/features/organization/services/AccessService'
import type { Permission } from '@/types/navigation'
import {
  AGING_BUCKETS,
  type DashboardSummary,
  type DateRange,
  type PaymentsReport,
  type ProductRank,
  type ReceivablesReport,
  type SalesReport,
  type TopProductsReport,
} from '../types/report'
import { bucketsBetween, granularityFor, rangeError } from '../utils/reportRange'
import { fillBuckets, minor, summarize } from '../utils/salesMath'
import { fromMinorUnits } from '@/features/billing/utils/minorUnits'
import { reportRepository, type IReportRepository } from './ReportRepository'

export const TOP_PRODUCTS_DEFAULT = 10
export const TOP_PRODUCTS_MAX = 200 // la pantalla muestra 20; la descarga a Excel trae hasta 200
export const DEBTORS_LIMIT = 10
const NO_ACCESS = 'No tienes permisos para ver los reportes'
const WALK_IN = 'Consumidor final'

type Failure = { error: string }
const fail = (error: string): Failure => ({ error })

export class ReportService {
  constructor(
    private readonly reports: IReportRepository,
    private readonly settings: IBillingSettingsRepository,
    private readonly access: IAccessResolver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Formato y zona horaria de la empresa: los reportes hablan en su moneda y cuentan los días en su calendario. */
  private async load(organizationId: string) {
    const settings = (await this.settings.find(organizationId)) ?? DEFAULT_BILLING_SETTINGS
    const display: DisplayFormat = {
      currency: settings.currency,
      currencyDecimals: settings.currencyDecimals,
      locale: settings.locale,
      timezone: settings.timezone,
    }
    return { display, today: todayInTimezone(this.now(), settings.timezone) }
  }

  private async authorize(userId: string, organizationId: string, permission: Permission) {
    return this.access.authorize(userId, organizationId, permission)
  }

  /** El formato de la empresa y su "hoy" (en su zona horaria): lo que la pantalla necesita para armar el período. */
  async context(userId: string, organizationId: string): Promise<{ display: DisplayFormat; today: string } | null> {
    const access = await this.authorize(userId, organizationId, 'finanzas.reportes.read')
    return access ? this.load(access.organizationId) : null
  }

  /**
   * Ventas por día (rangos de hasta 62 días) o por mes. Ventas netas = facturado − notas de crédito, cada cosa
   * en la fecha en que se emitió. Las anuladas no cuentan. Los períodos sin ventas aparecen en cero.
   */
  async sales(userId: string, organizationId: string, range: DateRange): Promise<Failure | { report: SalesReport }> {
    const access = await this.authorize(userId, organizationId, 'finanzas.reportes.read')
    if (!access) return fail(NO_ACCESS)
    const invalid = rangeError(range)
    if (invalid) return fail(invalid)

    const { display } = await this.load(access.organizationId)
    return { report: await this.buildSales(access.organizationId, range, display) }
  }

  private async buildSales(organizationId: string, range: DateRange, display: DisplayFormat): Promise<SalesReport> {
    const granularity = granularityFor(range)
    const decimals = display.currencyDecimals
    const [rows, collected] = await Promise.all([
      this.reports.salesBuckets(organizationId, range, display.timezone, granularity),
      this.reports.collected(organizationId, range, display.timezone),
    ])
    const points = fillBuckets(rows, bucketsBetween(range, granularity), decimals)
    return { range, granularity, display, points, totals: summarize(points, collected, decimals) }
  }

  /** Lo más vendido del rango, ya descontado lo acreditado. Por importe (con impuesto) o por cantidad. */
  async topProducts(
    userId: string,
    organizationId: string,
    input: DateRange & { rank?: ProductRank; limit?: number },
  ): Promise<Failure | { report: TopProductsReport }> {
    const access = await this.authorize(userId, organizationId, 'finanzas.reportes.read')
    if (!access) return fail(NO_ACCESS)
    const range = { from: input.from, to: input.to }
    const invalid = rangeError(range)
    if (invalid) return fail(invalid)

    const rank = input.rank === 'quantity' ? 'quantity' : 'revenue'
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? TOP_PRODUCTS_DEFAULT) || TOP_PRODUCTS_DEFAULT, 1), TOP_PRODUCTS_MAX)
    const { display } = await this.load(access.organizationId)
    const products = await this.reports.topProducts(access.organizationId, range, display.timezone, rank, limit)
    return { report: { range, rank, display, products } }
  }

  /**
   * Lo cobrado en el período, por forma de pago. Cuenta los cobros vigentes (un cobro anulado, o el de un documento
   * anulado, no cuenta) en la fecha en que se cobraron, sin importar cuándo se emitió el documento. Las devoluciones
   * de dinero se hacen fuera del sistema y por eso no se descuentan aquí.
   */
  async payments(userId: string, organizationId: string, range: DateRange): Promise<Failure | { report: PaymentsReport }> {
    const access = await this.authorize(userId, organizationId, 'finanzas.reportes.read')
    if (!access) return fail(NO_ACCESS)
    const invalid = rangeError(range)
    if (invalid) return fail(invalid)

    const { display } = await this.load(access.organizationId)
    const decimals = display.currencyDecimals
    const rows = await this.reports.paymentsByMethod(access.organizationId, range, display.timezone)

    // Una forma de pago desconocida (no debería existir: la base lo impide) se cuenta como "Otro", no se pierde
    const byMethod = new Map<PaymentMethod, { payments: number; minor: number }>()
    for (const row of rows) {
      const method = (PAYMENT_METHODS as readonly string[]).includes(row.method) ? (row.method as PaymentMethod) : 'other'
      const acc = byMethod.get(method) ?? { payments: 0, minor: 0 }
      byMethod.set(method, { payments: acc.payments + row.payments, minor: acc.minor + minor(row.amount, decimals) })
    }

    const methods = [...byMethod]
      .map(([method, acc]) => ({ method, payments: acc.payments, amount: fromMinorUnits(acc.minor, decimals) }))
      .sort((a, b) => b.amount - a.amount || PAYMENT_METHODS.indexOf(a.method) - PAYMENT_METHODS.indexOf(b.method))
    const totalMinor = [...byMethod.values()].reduce((sum, acc) => sum + acc.minor, 0)

    return {
      report: {
        range,
        display,
        payments: methods.reduce((sum, row) => sum + row.payments, 0),
        total: fromMinorUnits(totalMinor, decimals),
        methods,
      },
    }
  }

  /** Lo que se debe hoy: por tramo de atraso y por cliente. Descuenta notas de crédito y cobros. */
  async receivables(userId: string, organizationId: string): Promise<Failure | { report: ReceivablesReport }> {
    const access = await this.authorize(userId, organizationId, 'finanzas.reportes.read')
    if (!access) return fail(NO_ACCESS)
    const { display, today } = await this.load(access.organizationId)
    return { report: await this.buildReceivables(access.organizationId, today, display) }
  }

  private async buildReceivables(organizationId: string, today: string, display: DisplayFormat): Promise<ReceivablesReport> {
    const decimals = display.currencyDecimals
    const { aging, debtors } = await this.reports.receivables(organizationId, today, DEBTORS_LIMIT)
    const sumMinor = (rows: typeof aging) => rows.reduce((acc, row) => acc + minor(row.amount, decimals), 0)
    const late = aging.filter((row) => row.bucket !== 'current')

    return {
      asOf: today,
      display,
      documents: aging.reduce((acc, row) => acc + row.documents, 0),
      total: fromMinorUnits(sumMinor(aging), decimals),
      overdueDocuments: late.reduce((acc, row) => acc + row.documents, 0),
      overdue: fromMinorUnits(sumMinor(late), decimals),
      aging: AGING_BUCKETS.map((bucket) => aging.find((row) => row.bucket === bucket) ?? { bucket, documents: 0, amount: 0 }),
      debtors: debtors.map((debtor) => ({ ...debtor, name: debtor.name.trim() || WALK_IN })),
    }
  }

  /**
   * Los números del panel de inicio: hoy, ayer, esta semana y este mes, más lo que se debe. Los lee quien puede ver
   * facturación (el panel ya lo exigía), no hace falta el permiso de reportes.
   */
  async dashboard(userId: string, organizationId: string): Promise<DashboardSummary | null> {
    const access = await this.authorize(userId, organizationId, 'pos.facturacion.read')
    if (!access) return null
    const orgId = access.organizationId
    const { display, today } = await this.load(orgId)

    const yesterday = addDays(today, -1)
    const weekStart = addDays(today, -6)
    const monthStart = `${today.slice(0, 7)}-01`
    const month = { from: monthStart, to: today }
    // Un solo recorrido por día desde el más antiguo de los rangos que se muestran (mes en curso o 7 días), y de ahí se arma todo
    const from = monthStart < weekStart ? monthStart : weekStart
    const earliest = from < yesterday ? from : yesterday
    const [sales, receivables] = await Promise.all([
      this.reports.salesBuckets(orgId, { from: earliest, to: today }, display.timezone, 'day'),
      this.buildReceivables(orgId, today, display),
    ])

    const decimals = display.currencyDecimals
    const points = fillBuckets(sales, bucketsBetween({ from: earliest, to: today }, 'day'), decimals)
    const within = (range: DateRange) => points.filter((point) => point.bucket >= range.from && point.bucket <= range.to)
    const net = (range: DateRange) => summarize(within(range), 0, decimals)

    const monthTotals = net(month)
    return {
      display,
      asOf: today,
      today: { netTotal: net({ from: today, to: today }).netTotal, documents: net({ from: today, to: today }).documents },
      yesterday: { netTotal: net({ from: yesterday, to: yesterday }).netTotal },
      week: { documents: net({ from: weekStart, to: today }).documents },
      month: { netTotal: monthTotals.netTotal, documents: monthTotals.documents, averageTicket: monthTotals.averageTicket },
      receivables: { total: receivables.total, overdue: receivables.overdue },
    }
  }
}

export const reportService = new ReportService(reportRepository, billingSettingsRepository, accessService)
