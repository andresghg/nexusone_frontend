'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUserId } from '@/lib/supabase/get-user-id'
import {
  ProductHistorySchema,
  StockMovementSchema,
  type ProductHistoryInput,
  type StockMovementInput,
} from '../schemas/inventorySchema'
import type { HistoryResult } from '../types/inventory'
import { stockService } from '../services/StockService'

const INVENTORY_PATH = '/dashboard/[slug]/pos/inventario'

// Misma forma en todos los resultados: `stock` es el stock resultante, o null si falló.
const failure = (error: string) => ({ error, success: '', stock: null })

export async function registerMovementAction(input: StockMovementInput) {
  const data = StockMovementSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, ...movement } = data.data
    const result = await stockService.register(userId, organizationId, movement)
    if (!result.error) revalidatePath(INVENTORY_PATH, 'page')
    return result
  } catch {
    return failure('No se pudo registrar el movimiento')
  }
}

// Siempre se resuelve (nunca lanza): el historial se muestra con `use()` y un error no
// controlado rompería toda la pantalla en vez de mostrar un aviso.
export async function getProductHistoryAction(input: ProductHistoryInput): Promise<HistoryResult> {
  const data = ProductHistorySchema.safeParse(input)
  if (!data.success) return { error: 'Datos inválidos', items: [] }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', items: [] }

  try {
    const { organizationId, productId } = data.data
    return { error: '', items: await stockService.history(userId, organizationId, productId) }
  } catch {
    return { error: 'No se pudo cargar el historial', items: [] }
  }
}
