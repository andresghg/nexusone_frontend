import z from 'zod'

export const CreateInvitationSchema = z.object({
  role: z.enum(['admin', 'member'], { error: 'Rol inválido' }),
})

export const RevokeInvitationSchema = z.object({
  invitationId: z.uuid({ error: 'Invitación inválida' }),
})

export const AcceptInvitationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, { error: 'Invitación inválida' }),
})


export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>
export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>
export type RevokeInvitationInput = z.infer<typeof RevokeInvitationSchema>