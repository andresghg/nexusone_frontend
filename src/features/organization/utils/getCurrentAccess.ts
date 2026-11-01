import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Permission } from '@/types/navigation'
import { organizationRepository } from '../services/OrganizationRepository'
import { resolvePermissions } from '../permissions'
import { getActiveOrganization } from './getActiveOrganization'

export const getCurrentAccess = cache(async (slug: string) => {
  const { user, organization } = await getActiveOrganization(slug)
  const modules = await organizationRepository.findEnabledModuleKeys(organization.id)
  return { user, organization, permissions: resolvePermissions(organization.role, modules) }
})

export async function requirePermission(slug: string, permission: Permission) {
  const { permissions } = await getCurrentAccess(slug)
  if (!permissions.includes(permission)) redirect(`/dashboard/${slug}`)
}