'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ChangeRoleSchema,
  RemoveMemberSchema,
  type ChangeRoleInput,
  type RemoveMemberInput,
} from '../schemas/memberSchema'
import { memberService } from '../services/MemberService'

const USERS_PATH = '/dashboard/[slug]/configuracion/usuarios'

async function getUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

export async function changeMemberRoleAction(input: ChangeRoleInput) {
  const data = ChangeRoleSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const actorId = await getUserId()
  if (!actorId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, userId, role } = data.data
    const result = await memberService.changeRole(actorId, organizationId, userId, role)
    if (!result.error) revalidatePath(USERS_PATH, 'page')
    return result
  } catch {
    return { error: 'No se pudo cambiar el rol', success: '' }
  }
}

export async function removeMemberAction(input: RemoveMemberInput) {
  const data = RemoveMemberSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const actorId = await getUserId()
  if (!actorId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, userId } = data.data
    const result = await memberService.remove(actorId, organizationId, userId)
    if (!result.error) revalidatePath(USERS_PATH, 'page')
    return result
  } catch {
    return { error: 'No se pudo quitar al usuario', success: '' }
  }
}