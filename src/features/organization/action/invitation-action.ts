'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CreateInvitationSchema,
  RevokeInvitationSchema,
  AcceptInvitationSchema,
  type CreateInvitationInput,
  type RevokeInvitationInput,
  type AcceptInvitationInput,
} from '../schemas/invitationSchema'
import { invitationService } from '../services/InvitationService'

const USERS_PATH = '/dashboard/configuracion/usuarios'

async function getUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

export async function createInvitationAction(input: CreateInvitationInput) {
  const data = CreateInvitationSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '', token: '' }

  const actorId = await getUserId()
  if (!actorId) return { error: 'Sesión no válida', success: '', token: '' }

  try {
    const result = await invitationService.create(actorId, data.data.role)
    if (!result.error) revalidatePath(USERS_PATH)
    return result
  } catch {
    return { error: 'No se pudo crear la invitación', success: '', token: '' }
  }
}

export async function revokeInvitationAction(input: RevokeInvitationInput) {
  const data = RevokeInvitationSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const actorId = await getUserId()
  if (!actorId) return { error: 'Sesión no válida', success: '' }

  try {
    const result = await invitationService.revoke(actorId, data.data.invitationId)
    if (!result.error) revalidatePath(USERS_PATH)
    return result
  } catch {
    return { error: 'No se pudo revocar la invitación', success: '' }
  }
}

export async function acceptInvitationAction(input: AcceptInvitationInput) {
  const data = AcceptInvitationSchema.safeParse(input)
  if (!data.success) return { error: 'Invitación inválida', success: '' }

  const userId = await getUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    return await invitationService.accept(userId, data.data.token)
  } catch {
    return { error: 'No se pudo aceptar la invitación', success: '' }
  }
}
