import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentOrganization } from '@/features/organization/utils/getCurrentOrganization'

export default async function WithOrganizationLayout({ children }: { children: ReactNode }) {
  const { organization } = await getCurrentOrganization()
  if (!organization) redirect('/dashboard/configuracion/empresa')
  return <>{children}</>
}