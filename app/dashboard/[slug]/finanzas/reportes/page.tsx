import { ReportsView } from '@/features/reports/components/ReportsView'
import { loadReport } from '@/features/reports/services/loadReport'
import { parseReportParams } from '@/features/reports/utils/reportParams'
import { getCurrentAccess, requirePermission } from '@/features/organization/utils/getCurrentAccess'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TOP_PRODUCTS = 20 // en pantalla; la descarga a Excel trae más

export default async function ReportsPage({ params, searchParams }: Props) {
  const { slug } = await params
  await requirePermission(slug, 'finanzas.reportes.read')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization } = await getCurrentAccess(slug)
  const query = parseReportParams(await searchParams)
  const { display, today, range, data } = await loadReport(user.id, organization.id, query, { productLimit: TOP_PRODUCTS })

  return (
    <div className="mx-auto max-w-5xl">
      <ReportsView query={query} range={range} today={today} display={display} data={data} companyName={organization.name} />
    </div>
  )
}
