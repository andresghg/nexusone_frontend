import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { organizationRepository } from '@/features/organization/services/OrganizationRepository'
import { getSessionUser } from '@/features/organization/utils/getSessionUser'
import { pickInitialOrganization } from '@/features/organization/pickOrganization'

export default async function DashboardIndexPage() {
  const user = await getSessionUser()
  const organizations = await organizationRepository.findAllByUserId(user.id)

  if (organizations.length === 0) redirect('/nueva-empresa')

  const lastSlug = (await cookies()).get('last-org')?.value
  const target = pickInitialOrganization(organizations, lastSlug)!
  redirect(`/dashboard/${target.slug}`)
}