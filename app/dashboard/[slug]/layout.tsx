import type { ReactNode } from 'react'
import { DashboardShell } from '@/shared/components/navigation/DashboardShell'
import { getCurrentAccess } from '@/features/organization/utils/getCurrentAccess'
import { ROLE_LABEL } from '@/features/organization/permissions'
import { organizationRepository } from '@/features/organization/services/OrganizationRepository'
import { organizationService } from '@/features/organization/services/OrganizationService'
import { productService } from '@/features/inventory/services/ProductService'
import { profileService } from '@/features/profile/services/ProfileService'
import type { CurrentUser } from '@/shared/types/CurrentUser'

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Usuario autenticado, organización actual y permisos.
  const { user, organization, permissions } =
    await getCurrentAccess(slug)

  // Consultas independientes en paralelo.
  const [
    organizations,
    profile,
    creation,
    lowStockCount,
  ] = await Promise.all([
    organizationRepository.findAllByUserId(user.id),
    profileService.getByUserId(user.id),
    organizationService.getCreationStatus(user.id),
    productService.getLowStockCount(user.id, organization.id),
  ])

  const currentUser: CurrentUser = {
    name:
      profile?.fullName ??
      user.user_metadata?.full_name ??
      user.email?.split('@')[0] ??
      'Usuario',
    email: user.email ?? '',
    avatarUrl: profile?.avatarUrl ?? null,
    roleLabel: ROLE_LABEL[organization.role] ?? organization.role,
  }

  return (
    <DashboardShell
      slug={slug}
      permissions={permissions}
      organizations={organizations.map((org) => ({
        slug: org.slug,
        name: org.name,
        roleLabel: ROLE_LABEL[org.role] ?? org.role,
      }))}
      canCreateOrganization={creation.allowed}
      currentUser={currentUser}
      lowStockCount={lowStockCount}
    >
      {children}
    </DashboardShell>
  )
}