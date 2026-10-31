'use server'

import { createClient } from '@/lib/supabase/server'
import { OrganizationSchema, type OrganizationInput } from '../schemas/organizationSchema'
import { organizationService } from '../services/OrganizationService'

async function getUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

export async function createOrganizationAction(input: OrganizationInput) {
  const data = OrganizationSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    return await organizationService.create(userId, data.data)
  } catch {
    return { error: 'No se pudo registrar la empresa', success: '' }
  }
}

export async function updateOrganizationAction(input: OrganizationInput) {
  const data = OrganizationSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    return await organizationService.update(userId, data.data)
  } catch {
    return { error: 'No se pudo actualizar la empresa', success: '' }
  }
}