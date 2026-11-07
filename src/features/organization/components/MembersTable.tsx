'use client'

import { useTransition } from 'react'
import toast from 'react-hot-toast'
import { UserMinus, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Badge } from '@/shared/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  DataTable,
  DataTableEmpty,
  type DataTableColumn,
  type RowAction,
} from '@/shared/components/data-table'
import { changeMemberRoleAction, removeMemberAction } from '@/features/organization/action/member-action'
import { ROLE_LABEL } from '../permissions'
import type { MemberRow } from '../types/member'

type Props = {
  organizationId: string
  members: MemberRow[]
  currentUserId: string
  currentRole: string
}

const displayName = (member: MemberRow) => member.fullName ?? member.email ?? 'este usuario'

function initials(member: MemberRow) {
  const source = member.fullName?.trim() || member.email || '?'
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatDate(iso: string) {
  // zona fija: evita diferencias entre servidor y navegador al hidratar
  return new Date(iso).toLocaleDateString('es-CL', {
    dateStyle: 'medium',
    timeZone: 'America/Santiago',
  })
}

function MemberCell({ member, isSelf }: { member: MemberRow; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-8">
        <AvatarImage src={member.avatarUrl ?? undefined} />
        <AvatarFallback>{initials(member)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {member.fullName ?? 'Sin nombre'}
          {isSelf && ' (tú)'}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
    </div>
  )
}

// El rol editable lleva su propio estado de "guardando": la tabla no sabe nada de roles
function RoleCell({
  member,
  organizationId,
  editable,
}: {
  member: MemberRow
  organizationId: string
  editable: boolean
}) {
  const [pending, startTransition] = useTransition()

  if (!editable) {
    return (
      <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
        {ROLE_LABEL[member.role] ?? member.role}
      </Badge>
    )
  }

  return (
    <Select
      value={member.role}
      disabled={pending}
      onValueChange={(role) =>
        startTransition(async () => {
          try {
            const { error, success } = await changeMemberRoleAction({
              organizationId,
              userId: member.userId,
              role: role as 'admin' | 'member',
            })
            if (error) toast.error(error)
            else toast.success(success)
          } catch {
            toast.error('No se pudo cambiar el rol')
          }
        })
      }
    >
      <SelectTrigger className="w-40" aria-label={`Rol de ${displayName(member)}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Administrador</SelectItem>
        <SelectItem value="member">Miembro</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function MembersTable({ organizationId, members, currentUserId, currentRole }: Props) {
  // Reglas SOLO para mostrar u ocultar controles; el servidor (MemberService) es quien decide.
  const canChangeRole = (member: MemberRow) => currentRole === 'owner' && member.role !== 'owner'
  const canRemove = (member: MemberRow) =>
    member.userId !== currentUserId &&
    member.role !== 'owner' &&
    (currentRole === 'owner' || (currentRole === 'admin' && member.role === 'member'))

  const remove = async (member: MemberRow) => {
    try {
      const { error, success } = await removeMemberAction({ organizationId, userId: member.userId })
      if (error) toast.error(error)
      else toast.success(success)
    } catch {
      toast.error('No se pudo quitar al usuario')
    }
  }

  const columns: DataTableColumn<MemberRow>[] = [
    {
      id: 'member',
      header: 'Usuario',
      cell: (member) => <MemberCell member={member} isSelf={member.userId === currentUserId} />,
    },
    {
      id: 'role',
      header: 'Rol',
      cell: (member) => (
        <RoleCell member={member} organizationId={organizationId} editable={canChangeRole(member)} />
      ),
    },
    {
      id: 'joined',
      header: 'Desde',
      hideBelow: 'md',
      className: 'text-sm text-muted-foreground',
      cell: (member) => formatDate(member.joinedAt),
    },
  ]

  const actionsFor = (member: MemberRow): RowAction[] =>
    canRemove(member)
      ? [
          {
            id: 'remove',
            label: 'Quitar de la empresa',
            icon: UserMinus,
            variant: 'destructive',
            confirm: {
              title: `¿Quitar a ${displayName(member)}?`,
              description: 'Perderá el acceso a la empresa de inmediato.',
              confirmLabel: 'Quitar',
            },
            onSelect: () => remove(member),
          },
        ]
      : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y permisos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? 'usuario' : 'usuarios'} en tu empresa
        </p>
      </div>

      <DataTable
        caption="Usuarios de la empresa"
        columns={columns}
        rows={members}
        getRowId={(member) => member.userId}
        getRowLabel={displayName}
        rowActions={actionsFor}
        empty={
          <DataTableEmpty
            filtered={false}
            icon={Users}
            title="Sin usuarios"
            description="Invita a tu equipo con un enlace de invitación."
          />
        }
      />
    </div>
  )
}
