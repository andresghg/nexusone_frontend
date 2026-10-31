'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Copy, X } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import type { InvitationRow } from '../types/invitation'
import { createInvitationAction, revokeInvitationAction } from '../action/invitation-action'

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', member: 'Miembro' }

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Santiago', // zona fija: evita desajustes al hidratar
  })
}

type Props = { invitations: InvitationRow[]; canInviteAdmin: boolean }

export function InvitationsPanel({ invitations, canInviteAdmin }: Props) {
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [link, setLink] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const create = () =>
    startTransition(async () => {
      const { error, success, token } = await createInvitationAction({ role })
      if (error) {
        toast.error(error)
        return
      }
      toast.success(success)
      setLink(`${window.location.origin}/invitacion/${token}`)
    })

  const revoke = (invitationId: string) =>
    startTransition(async () => {
      const { error, success } = await revokeInvitationAction({ invitationId })
      if (error) toast.error(error)
      else toast.success(success)
    })

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    toast.success('Enlace copiado')
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Invitaciones</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Genera un enlace de un solo uso (vence en 72 horas) y compártelo con quien quieras sumar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canInviteAdmin ? (
          <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'member')}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Miembro</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">Miembro</Badge>
        )}
        <Button onClick={create} disabled={pending}>
          Generar enlace
        </Button>
      </div>

      {link && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copiar enlace">
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cópialo ahora: por seguridad no se vuelve a mostrar. Si lo pierdes, revoca la invitación y crea otra.
          </p>
        </div>
      )}

      {invitations.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{ROLE_LABEL[inv.role] ?? inv.role}</Badge>
                <span className="text-sm text-muted-foreground">
                  Vence {formatDateTime(inv.expiresAt)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                onClick={() => revoke(inv.id)}
                aria-label="Revocar invitación"
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}