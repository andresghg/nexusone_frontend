import { getCurrentAccess } from '@/features/organization/utils/getCurrentAccess'
import { OrganizationForm } from '@/features/organization/components/OrganizationForm'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { organization } = await getCurrentAccess(slug)
  return <OrganizationForm organization={organization} />
}