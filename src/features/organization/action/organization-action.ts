'use server'

import { createClient } from '@/lib/supabase/server'
import {
  OrganizationSchema,
  UpdateOrganizationSchema,
  type OrganizationInput,
  type UpdateOrganizationInput,
} from '../schemas/organizationSchema'
import { organizationService } from '../services/OrganizationService'

async function getUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

export async function createOrganizationAction(input: OrganizationInput) {
  const data = OrganizationSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '', slug: '' }

  const userId = await getUserId()
  if (!userId) return { error: 'Sesión no válida', success: '', slug: '' }

  try {
    return await organizationService.create(userId, data.data)
  } catch {
    return { error: 'No se pudo registrar la empresa', success: '', slug: '' }
  }
}

export async function updateOrganizationAction(input: UpdateOrganizationInput) {
  const data = UpdateOrganizationSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, ...organization } = data.data
    return await organizationService.update(userId, organizationId, organization)
  } catch {
    return { error: 'No se pudo actualizar la empresa', success: '' }
  }
}