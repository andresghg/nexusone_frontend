import { PERMISSIONS, type Permission } from '@/types/navigation'

export const ORGANIZATION_ROLES = ['owner', 'admin', 'member'] as const
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]

const MEMBER_PERMISSIONS: readonly Permission[] = [
  'dashboard.read',
  'pos.facturacion.read',
  'pos.facturacion.create',
  'pos.inventario.read',
  'gestion.calendario.read',
  'gestion.tareas.read',
  'gestion.mensajeria.read',
  'config.empresa.read',
]

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  member: MEMBER_PERMISSIONS, // sin finanzas ni gestión de usuarios
}

// Módulos que no se activan ni desactivan por empresa
const ALWAYS_ON = new Set(['dashboard', 'config'])

export function resolvePermissions(
  role: string,
  enabledModules: readonly string[],
): Permission[] {
  const granted = ROLE_PERMISSIONS[role as OrganizationRole] ?? []
  return granted.filter((permission) => {
    const moduleKey = permission.split('.')[0] // 'pos.inventario.read' → 'pos'
    return ALWAYS_ON.has(moduleKey) || enabledModules.includes(moduleKey)
  })
}

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
}