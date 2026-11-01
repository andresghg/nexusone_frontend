'use client'

import { useTransition } from 'react'
import toast from 'react-hot-toast'
import { Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table'
import type { MemberRow } from '../types/member'
import { changeMemberRoleAction, removeMemberAction } from '../action/member-actions'

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
}

function initials(m: MemberRow) {
  const source = m.fullName?.trim() || m.email || '?'
  return source.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase()
}

function formatDate(iso: string) {
  // zona fija: evita diferencias entre servidor y navegador al hidratar
  return new Date(iso).toLocaleDateString('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' })
}

type Props = { organizationId: string; members: MemberRow[]; currentUserId: string; currentRole: string }

export function MembersTable({ organizationId, members, currentUserId, currentRole }: Props) {
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ error: string; success: string }>) =>
    startTransition(async () => {
      const { error, success } = await fn()
      if (error) toast.error(error)
      else toast.success(success)
    })

  const canChangeRole = (m: MemberRow) => currentRole === 'owner' && m.role !== 'owner'
  const canRemove = (m: MemberRow) =>
    m.userId !== currentUserId &&
    m.role !== 'owner' &&
    (currentRole === 'owner' || (currentRole === 'admin' && m.role === 'member'))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y permisos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? 'usuario' : 'usuarios'} en tu empresa
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="hidden md:table-cell">Desde</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={m.avatarUrl ?? undefined} />
                      <AvatarFallback>{initials(m)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {m.fullName ?? 'Sin nombre'}
                        {m.userId === currentUserId && ' (tú)'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  {canChangeRole(m) ? (
                    <Select
                      value={m.role}
                      disabled={pending}
                      onValueChange={(role) =>
                        run(() => changeMemberRoleAction({ organizationId, userId: m.userId, role: role as 'admin' | 'member' }))
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="member">Miembro</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={m.role === 'owner' ? 'default' : 'secondary'}>
                      {ROLE_LABEL[m.role] ?? m.role}
                    </Badge>
                  )}
                </TableCell>

                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {formatDate(m.joinedAt)}
                </TableCell>

                <TableCell className="text-right">
                  {canRemove(m) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={`Quitar a ${m.fullName ?? m.email ?? 'usuario'}`}
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Quitar a este usuario?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Perderá el acceso a la empresa de inmediato.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => run(() => removeMemberAction({ organizationId, userId: m.userId }))}>
                            Quitar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}