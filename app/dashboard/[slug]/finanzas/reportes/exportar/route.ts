import { getCurrentAccess } from '@/features/organization/utils/getCurrentAccess'
import { loadReport } from '@/features/reports/services/loadReport'
import { buildReportWorkbook } from '@/features/reports/services/reportXlsx'
import { reportFilename } from '@/features/reports/utils/reportFile'
import { parseReportParams } from '@/features/reports/utils/reportParams'

// Descarga del reporte activo en Excel. Los mismos parámetros que la pantalla (?tab=…&periodo=…), así que
// lo descargado es exactamente lo que se ve. Se arma en el servidor con los mismos servicios y permisos.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXPORT_PRODUCTS = 200
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const problem = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Sesión y pertenencia a la empresa (igual que la página: sin sesión o sin acceso no hay descarga)
  const { user, organization, permissions } = await getCurrentAccess(slug)
  if (!permissions.includes('finanzas.reportes.read')) return problem('No tienes permisos para ver los reportes', 403)

  const query = parseReportParams(Object.fromEntries(new URL(request.url).searchParams))
  const loaded = await loadReport(user.id, organization.id, query, { productLimit: EXPORT_PRODUCTS })
  if (loaded.status === 'forbidden') return problem('No tienes permisos para ver los reportes', 403)
  if ('error' in loaded.data) return problem(loaded.data.error, loaded.status === 'invalid' ? 400 : 500)

  const file = await buildReportWorkbook(loaded.data, { companyName: organization.name, generatedAt: new Date() })
  const name = reportFilename(query.tab, loaded.range, loaded.today, 'xlsx')
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
