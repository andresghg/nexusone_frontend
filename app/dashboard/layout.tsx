import type { ReactNode } from 'react'
import { DashboardShell } from '@/shared/components/navigation/DashboardShell'
import { getCurrentAccess } from '@/features/organization/utils/getCurrentAccess'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { permissions } = await getCurrentAccess()
  return <DashboardShell permissions={permissions}>{children}</DashboardShell>
}