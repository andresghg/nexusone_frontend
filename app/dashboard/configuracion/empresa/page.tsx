import { getCurrentOrganization } from '@/features/organization/utils/getCurrentOrganization'
import { OrganizationForm } from '@/features/organization/components/OrganizationForm'
import { requirePermission } from '@/features/organization/utils/getCurrentAccess'

export default async function Page() {
  const { organization } = await getCurrentOrganization()

  await requirePermission('config.empresa.read')
  
  return <OrganizationForm organization={organization} />
}