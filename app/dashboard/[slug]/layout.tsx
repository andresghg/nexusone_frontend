import type { ReactNode } from 'react'
import { DashboardShell } from '@/shared/components/navigation/DashboardShell'
import { getCurrentAccess } from '@/features/organization/utils/getCurrentAccess'
import { ROLE_LABEL } from '@/features/organization/permissions'
import { organizationRepository } from '@/features/organization/services/OrganizationRepository'
import { organizationService } from '@/features/organization/services/OrganizationService'
import { createClient } from '@/lib/supabase/server' // ajusta al nombre real de tu cliente de servidor
import type { CurrentUser } from '@/shared/types/CurrentUser'


export default async function OrganizationLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { user, permissions } = await getCurrentAccess(slug) // 404 si no es miembro

  const supabase = await createClient()

  const [
    { data: { user: authUser } },
    { data: profile },
    organizations,
    creation,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle(),
    organizationRepository.findAllByUserId(user.id),
    organizationService.getCreationStatus(user.id),
  ])

  const currentOrg = organizations.find((o) => o.slug === slug)

  const currentUser: CurrentUser = {
    name:
      profile?.full_name ??
      authUser?.user_metadata?.full_name ??
      authUser?.email?.split('@')[0] ??
      'Usuario',
    email: authUser?.email ?? '',
    avatarUrl: profile?.avatar_url ?? null,
    roleLabel: currentOrg ? (ROLE_LABEL[currentOrg.role] ?? currentOrg.role) : '',
  }

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
      currentUser={currentUser}
    >
      {children}
    </DashboardShell>
  )
}