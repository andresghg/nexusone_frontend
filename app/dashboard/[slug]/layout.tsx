import type { ReactNode } from 'react'
import { DashboardShell } from '@/shared/components/navigation/DashboardShell'
import { getCurrentAccess } from '@/features/organization/utils/getCurrentAccess'
import { ROLE_LABEL } from '@/features/organization/permissions'
import { organizationRepository } from '@/features/organization/services/OrganizationRepository'
import { organizationService } from '@/features/organization/services/OrganizationService'

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { user, permissions } = await getCurrentAccess(slug) // 404 si no es miembro

  const [organizations, creation] = await Promise.all([
    organizationRepository.findAllByUserId(user.id),
    organizationService.getCreationStatus(user.id),
  ])

  return (
    <DashboardShell
      slug={slug}
      permissions={permissions}
      organizations={organizations.map((o) => ({
        slug: o.slug,
        name: o.name,
        roleLabel: ROLE_LABEL[o.role] ?? o.role,
      }))}
      canCreateOrganization={creation.allowed}
    >
      {children}
    </DashboardShell>
  )
}