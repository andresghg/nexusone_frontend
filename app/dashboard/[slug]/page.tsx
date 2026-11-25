import DashboardPage from '@/features/dashboard/pages/DashboardPage'
import { productService } from '@/features/inventory/services/ProductService'
import { getCurrentAccess, requirePermission } from '@/features/organization/utils/getCurrentAccess'
import { reportService } from '@/features/reports/services/ReportService'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requirePermission(slug, 'pos.facturacion.read')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization, permissions } = await getCurrentAccess(slug)
  const canViewInventory = permissions.includes('pos.inventario.read')

  const [summary, active, lowStock] = await Promise.all([
    reportService.dashboard(user.id, organization.id),
    canViewInventory
      ? productService.list(user.id, organization.id, { status: 'active' }, { page: 1, pageSize: 1 })
      : Promise.resolve(null),
    canViewInventory ? productService.getLowStockCount(user.id, organization.id) : Promise.resolve(0),
  ])
  // Sin permiso de facturación no hay panel (ya lo exigió requirePermission; esto solo cubre una carrera de permisos)
  if (!summary) return null

  return (
    <DashboardPage
      summary={summary}
      basePath={`/dashboard/${slug}`}
      inventory={active ? { activeProducts: active.total, lowStock } : null}
      canViewReports={permissions.includes('finanzas.reportes.read')}
    />
  )
}
