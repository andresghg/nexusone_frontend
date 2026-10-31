import DashboardPage from '@/features/dashboard/pages/DashboardPage'
import { requirePermission } from '@/features/organization/utils/getCurrentAccess'

export default async function Page() {
  // TODO: Verificar permisos
  // Si no tiene permiso, redirigir a /dashboard
  await requirePermission('pos.facturacion.read')
  
  return <DashboardPage />
}
