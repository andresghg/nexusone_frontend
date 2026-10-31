import z from 'zod'

export const ChangeRoleSchema = z.object({
  userId: z.uuid({ error: 'Usuario inválido' }),
  role: z.enum(['admin', 'member'], { error: 'Rol inválido' }),
})

export const RemoveMemberSchema = z.object({
  userId: z.uuid({ error: 'Usuario inválido' }),
})

export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>
export type RemoveMemberInput = z.infer<typeof RemoveMemberSchema>