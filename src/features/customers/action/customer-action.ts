'use server'

import { revalidatePath } from 'next/cache'
import z from 'zod'
import { getAuthUserId } from '@/lib/supabase/get-user-id'
import {
  CreateCustomerSchema,
  SetCustomerActiveSchema,
  UpdateCustomerSchema,
  type CreateCustomerInput,
  type SetCustomerActiveInput,
  type UpdateCustomerInput,
} from '../schemas/customerSchema'
import { customerService } from '../services/CustomerService'
import type { CustomerOption } from '../types/customers'

const CUSTOMERS_PATH = '/dashboard/[slug]/pos/clientes'

const failure = (error: string) => ({ error, success: '' })

export async function createCustomerAction(
  input: CreateCustomerInput,
): Promise<{ error: string; success: string; customer?: CustomerOption }> {
  const data = CreateCustomerSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, ...customer } = data.data
    const result = await customerService.create(userId, organizationId, customer)
    if (!result.error) revalidatePath(CUSTOMERS_PATH, 'page')
    return result
  } catch {
    return failure('No se pudo crear el cliente')
  }
}

const SearchCustomersSchema = z.object({
  organizationId: z.uuid({ error: 'Empresa inválida' }),
  query: z.string().trim().max(100, { error: 'La búsqueda admite máximo 100 caracteres' }),
})

export async function searchCustomersAction(input: {
  organizationId: string
  query: string
}): Promise<{ error: string; customers: CustomerOption[] }> {
  const data = SearchCustomersSchema.safeParse(input)
  if (!data.success) return { error: data.error.issues[0]?.message ?? 'Datos inválidos', customers: [] }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', customers: [] }

  try {
    const customers = await customerService.search(userId, data.data.organizationId, data.data.query)
    return { error: '', customers }
  } catch {
    return { error: 'No se pudo buscar clientes', customers: [] }
  }
}

export async function updateCustomerAction(input: UpdateCustomerInput) {
  const data = UpdateCustomerSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, customerId, ...customer } = data.data
    const result = await customerService.update(userId, organizationId, customerId, customer)
    if (!result.error) revalidatePath(CUSTOMERS_PATH, 'page')
    return result
  } catch {
    return failure('No se pudo actualizar el cliente')
  }
}

export async function setCustomerActiveAction(input: SetCustomerActiveInput) {
  const data = SetCustomerActiveSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, customerId, active } = data.data
    const result = await customerService.setActive(userId, organizationId, customerId, active)
    if (!result.error) revalidatePath(CUSTOMERS_PATH, 'page')
    return result
  } catch {
    return failure('No se pudo cambiar el estado del cliente')
  }
}
