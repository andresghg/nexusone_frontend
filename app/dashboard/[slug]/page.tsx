import DashboardPage from '@/features/dashboard/pages/DashboardPage'
import { requirePermission } from '@/features/organization/utils/getCurrentAccess'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  // TODO: Verificar permisos
  // Si no tiene permiso, redirigir a /dashboard
  const { slug } = await params
  await requirePermission(slug, 'pos.facturacion.read')
  
  return <DashboardPage />
}
