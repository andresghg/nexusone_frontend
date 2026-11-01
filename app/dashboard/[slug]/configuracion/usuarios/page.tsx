import { getCurrentAccess, requirePermission } from '@/features/organization/utils/getCurrentAccess'
import { memberService } from '@/features/organization/services/MemberService'
import { invitationService } from '@/features/organization/services/InvitationService'
import { MembersTable } from '@/features/organization/components/MembersTable'
import { InvitationsPanel } from '@/features/organization/components/InvitationsPanel'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requirePermission(slug, 'config.usuarios.read')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization } = await getCurrentAccess(slug)
  const [members, invitations] = await Promise.all([
    memberService.list(user.id, organization.id),
    invitationService.listPending(user.id, organization.id),
  ])

  return (
    <div className="space-y-10">
      <MembersTable
        organizationId={organization.id}
        members={members}
        currentUserId={user.id}
        currentRole={organization.role}
      />
      <InvitationsPanel
        organizationId={organization.id}
        invitations={invitations}
        canInviteAdmin={organization.role === 'owner'}
      />
    </div>
  )
}