'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUserId } from '@/lib/supabase/get-user-id'
import {
  UpdateBillingSettingsSchema,
  type UpdateBillingSettingsInput,
} from '../schemas/billingSettingsSchema'
import { billingSettingsService } from '../services/BillingSettingsService'

const SETTINGS_PATH = '/dashboard/[slug]/configuracion/facturacion'

const failure = (error: string) => ({ error, success: '' })

export async function updateBillingSettingsAction(input: UpdateBillingSettingsInput) {
  const data = UpdateBillingSettingsSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, ...settings } = data.data
    const result = await billingSettingsService.update(userId, organizationId, settings)
    if (!result.error) revalidatePath(SETTINGS_PATH, 'page')
    return result
  } catch {
    return failure('No se pudo guardar la configuración')
  }
}
