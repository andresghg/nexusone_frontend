import type { Permission } from '@/types/navigation'
import { resolvePermissions } from '../permissions'
import { organizationRepository, type IOrganizationRepository } from './OrganizationRepository'

export type Access = {
  organizationId: string
  role: string
  permissions: Permission[]
}

/** Contrato que usan los services de los módulos (y sus tests, con un falso). */
export interface IAccessResolver {
  authorize(userId: string, organizationId: string, permission: Permission): Promise<Access | null>
}

export class AccessService implements IAccessResolver {
  constructor(private organizations: IOrganizationRepository) {}

  // Rol en ESA empresa + módulos activos de ESA empresa = permisos efectivos.
  async resolve(userId: string, organizationId: string): Promise<Access | null> {
    const membership = await this.organizations.findByUserAndId(userId, organizationId)
    if (!membership) return null

    const modules = await this.organizations.findEnabledModuleKeys(membership.id)
    return {
      organizationId: membership.id,
      role: membership.role,
      permissions: resolvePermissions(membership.role, modules),
    }
  }

  // Devuelve el acceso solo si incluye el permiso pedido; si no, null.
  async authorize(userId: string, organizationId: string, permission: Permission) {
    const access = await this.resolve(userId, organizationId)
    return access?.permissions.includes(permission) ? access : null
  }
}

export const accessService = new AccessService(organizationRepository)