import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/shared/components/navigation/DashboardShell'
import { currentUserPermissions } from '@/config/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Server Component: valida la sesión de Supabase y pasa los permisos
 * — datos serializables — al shell interactivo. La configuración de
 * navegación (con sus íconos) se importa directamente en el shell, ya que
 * componentes/funciones no pueden cruzar el límite server → client como prop.
 * Los permisos siguen simulados: `currentUserPermissions` se reemplaza por
 * los reales (organization_members + organization_modules) más adelante.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return <DashboardShell permissions={currentUserPermissions}>{children}</DashboardShell>
}
