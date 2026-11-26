import 'server-only'
import { DEFAULT_DISPLAY_FORMAT, type DisplayFormat } from '@/features/billing/types/billing'
import { todayInTimezone } from '@/features/billing/utils/dates'
import type { DateRange, ReportData } from '../types/report'
import type { ReportsQuery } from '../utils/reportParams'
import { resolvePeriod } from '../utils/reportPeriod'
import { reportService, type ReportService } from './ReportService'

export type LoadedReport = {
  display: DisplayFormat
  today: string
  range: DateRange // el período resuelto (el mes en curso si el pedido era inválido)
  data: ReportData
  // 'forbidden': sin permiso de reportes. 'invalid': el período pedido no vale. 'ok': hay reporte (o un error de consulta en data).
  status: 'ok' | 'forbidden' | 'invalid'
}

/**
 * El reporte de la pestaña pedida, con el período ya resuelto con el "hoy" de la empresa. Lo usan la pantalla y la
 * descarga a Excel, así lo que se descarga es exactamente lo que se ve. Solo se consulta la pestaña activa.
 */
export async function loadReport(
  userId: string,
  organizationId: string,
  query: ReportsQuery,
  options: { productLimit: number },
  service: ReportService = reportService,
): Promise<LoadedReport> {
  const context = await service.context(userId, organizationId)
  if (!context) {
    const display = DEFAULT_DISPLAY_FORMAT
    const today = todayInTimezone(new Date(), display.timezone)
    const range = resolvePeriod({ period: 'mes', from: '', to: '' }, today).range
    return { display, today, range, status: 'forbidden', data: { tab: query.tab, error: 'No tienes permisos para ver los reportes' } }
  }

  const { display, today } = context
  const { range, error: periodError } = resolvePeriod(query, today)
  const done = (data: ReportData, status: LoadedReport['status'] = 'ok'): LoadedReport => ({ display, today, range, data, status })

  if (query.tab === 'cobrar') {
    const result = await service.receivables(userId, organizationId)
    return done('report' in result ? { tab: 'cobrar', report: result.report } : { tab: 'cobrar', error: result.error })
  }
  if (periodError) return done({ tab: query.tab, error: periodError }, 'invalid')

  if (query.tab === 'productos') {
    const result = await service.topProducts(userId, organizationId, {
      ...range,
      rank: query.rank === 'cantidad' ? 'quantity' : 'revenue',
      limit: options.productLimit,
    })
    return done('report' in result ? { tab: 'productos', report: result.report } : { tab: 'productos', error: result.error })
  }

  if (query.tab === 'cobros') {
    const result = await service.payments(userId, organizationId, range)
    return done('report' in result ? { tab: 'cobros', report: result.report } : { tab: 'cobros', error: result.error })
  }

  const result = await service.sales(userId, organizationId, range)
  return done('report' in result ? { tab: 'ventas', report: result.report } : { tab: 'ventas', error: result.error })
}
