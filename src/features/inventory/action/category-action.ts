'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUserId } from '@/lib/supabase/get-user-id'
import {
  CreateCategorySchema,
  DeleteCategorySchema,
  RenameCategorySchema,
  type CreateCategoryInput,
  type DeleteCategoryInput,
  type RenameCategoryInput,
} from '../schemas/inventorySchema'
import { categoryService } from '../services/CategoryService'

const INVENTORY_PATH = '/dashboard/[slug]/pos/inventario'

export async function createCategoryAction(input: CreateCategoryInput) {
  const data = CreateCategorySchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, name } = data.data
    const result = await categoryService.create(userId, organizationId, name)
    if (!result.error) revalidatePath(INVENTORY_PATH, 'page')
    return result
  } catch {
    return { error: 'No se pudo crear la categoría', success: '' }
  }
}

export async function renameCategoryAction(input: RenameCategoryInput) {
  const data = RenameCategorySchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, categoryId, name } = data.data
    const result = await categoryService.rename(userId, organizationId, categoryId, name)
    if (!result.error) revalidatePath(INVENTORY_PATH, 'page')
    return result
  } catch {
    return { error: 'No se pudo actualizar la categoría', success: '' }
  }
}

export async function deleteCategoryAction(input: DeleteCategoryInput) {
  const data = DeleteCategorySchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', success: '' }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', success: '' }

  try {
    const { organizationId, categoryId } = data.data
    const result = await categoryService.remove(userId, organizationId, categoryId)
    if (!result.error) revalidatePath(INVENTORY_PATH, 'page')
    return result
  } catch {
    return { error: 'No se pudo eliminar la categoría', success: '' }
  }
}
