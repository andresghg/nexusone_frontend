'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUserId } from '@/lib/supabase/get-user-id'
import {
  CreateProductSchema,
  SetProductActiveSchema,
  UpdateProductSchema,
  type CreateProductInput,
  type SetProductActiveInput,
  type UpdateProductInput,
} from '../schemas/inventorySchema'
import { productService } from '../services/ProductService'

const INVENTORY_PATH = '/dashboard/[slug]/pos/inventario'

export async function createProductAction(input: CreateProductInput) {
  const data = CreateProductSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, initialStock, ...product } = data.data
    const result = await productService.create(userId, organizationId, product, initialStock)
    if (!result.error) revalidatePath(INVENTORY_PATH, 'page')
    return result
  } catch {
    return { error: 'No se pudo crear el producto', success: '' }
  }
}

export async function updateProductAction(input: UpdateProductInput) {
  const data = UpdateProductSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, productId, ...product } = data.data
    const result = await productService.update(userId, organizationId, productId, product)
    if (!result.error) revalidatePath(INVENTORY_PATH, 'page')
    return result
  } catch {
    return { error: 'No se pudo actualizar el producto', success: '' }
  }
}

export async function setProductActiveAction(input: SetProductActiveInput) {
  const data = SetProductActiveSchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, productId, active } = data.data
    const result = await productService.setActive(userId, organizationId, productId, active)
    if (!result.error) revalidatePath(INVENTORY_PATH, 'page')
    return result
  } catch {
    return { error: 'No se pudo cambiar el estado del producto', success: '' }
  }
}
