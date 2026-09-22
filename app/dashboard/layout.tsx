import type { ReactNode } from 'react'
import { DashboardShell } from '@/components/navigation/DashboardShell'
import { currentUserPermissions } from '@/config/navigation'

/**
 * Server Component: obtiene la sesión (aquí simulada) y pasa los permisos
 * — datos serializables — al shell interactivo. La configuración de
 * navegación (con sus íconos) se importa directamente en el shell, ya que
 * componentes/funciones no pueden cruzar el límite server → client como prop.
 * En producción `currentUserPermissions` se reemplaza por los permisos
 * reales de la sesión.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell permissions={currentUserPermissions}>{children}</DashboardShell>
}
