import { redirect } from 'next/navigation'
import { getCurrentAccess, requirePermission } from '@/features/organization/utils/getCurrentAccess'
import { memberService } from '@/features/organization/services/MemberService'
import { invitationService } from '@/features/organization/services/InvitationService'
import { MembersTable } from '@/features/organization/components/MembersTable'
import { InvitationsPanel } from '@/features/organization/components/InvitationsPanel'

export default async function Page() {
  await requirePermission('config.usuarios.read')

  const { user, organization } = await getCurrentAccess()
  if (!organization) redirect('/dashboard/configuracion/empresa')

  const [members, invitations] = await Promise.all([
    memberService.list(user.id),
    invitationService.listPending(user.id),
  ])

  return (
    <div className="space-y-10">
      <MembersTable members={members} currentUserId={user.id} currentRole={organization.role} />
      <InvitationsPanel invitations={invitations} canInviteAdmin={organization.role === 'owner'} />
    </div>
  )
}