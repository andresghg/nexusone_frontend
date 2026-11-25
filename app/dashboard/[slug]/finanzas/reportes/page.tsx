import { ReportsView, type ReportData } from '@/features/reports/components/ReportsView'
import { reportService } from '@/features/reports/services/ReportService'
import { parseReportParams } from '@/features/reports/utils/reportParams'
import { resolvePeriod } from '@/features/reports/utils/reportPeriod'
import { getCurrentAccess, requirePermission } from '@/features/organization/utils/getCurrentAccess'
import { DEFAULT_DISPLAY_FORMAT } from '@/features/billing/types/billing'
import { todayInTimezone } from '@/features/billing/utils/dates'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TOP_PRODUCTS = 20

export default async function ReportsPage({ params, searchParams }: Props) {
  const { slug } = await params
  await requirePermission(slug, 'finanzas.reportes.read')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization } = await getCurrentAccess(slug)
  const query = parseReportParams(await searchParams)

  // El "hoy" y el formato son de la empresa: un reporte a las 23:00 en Chile no es del día siguiente de UTC
  const context = await reportService.context(user.id, organization.id)
  const display = context?.display ?? DEFAULT_DISPLAY_FORMAT
  const today = context?.today ?? todayInTimezone(new Date(), display.timezone)
  const { range, error: periodError } = resolvePeriod(query, today)

  // Solo se consulta la pestaña activa (y solo si el período es válido)
  let data: ReportData
  if (query.tab === 'cobrar') {
    const result = await reportService.receivables(user.id, organization.id)
    data = 'report' in result ? { tab: 'cobrar', report: result.report } : { tab: 'cobrar', error: result.error }
  } else if (periodError) {
    data = { tab: query.tab, error: periodError }
  } else if (query.tab === 'productos') {
    const result = await reportService.topProducts(user.id, organization.id, {
      ...range,
      rank: query.rank === 'cantidad' ? 'quantity' : 'revenue',
      limit: TOP_PRODUCTS,
    })
    data = 'report' in result ? { tab: 'productos', report: result.report } : { tab: 'productos', error: result.error }
  } else {
    const result = await reportService.sales(user.id, organization.id, range)
    data = 'report' in result ? { tab: 'ventas', report: result.report } : { tab: 'ventas', error: result.error }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <ReportsView query={query} range={range} today={today} display={display} data={data} />
    </div>
  )
}
