import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Permission } from '@/types/navigation'
import { organizationRepository } from '../services/OrganizationRepository'
import { resolvePermissions } from '../permissions'
import { getCurrentOrganization } from './getCurrentOrganization'

export const getCurrentAccess = cache(async () => {
  const { user, organization } = await getCurrentOrganization()

  // Sin empresa: solo puede registrarla
  if (!organization) {
    return { user, organization: null, permissions: ['config.empresa.read'] as Permission[] }
  }

  const modules = await organizationRepository.findEnabledModuleKeys(organization.id)
  return { user, organization, permissions: resolvePermissions(organization.role, modules) }
})

export async function requirePermission(permission: Permission) {
  const { permissions } = await getCurrentAccess()
  if (!permissions.includes(permission)) redirect('/dashboard')
}