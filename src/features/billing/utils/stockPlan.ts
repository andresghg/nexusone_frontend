import { toMilli } from '@/features/inventory/utils/stockMath'
import type { StockShortage } from '../types/invoice'

export type StockRequest = {
  productId: string
  name: string
  unit: string
  quantity: number
}

export type StockPlan =
  | { ok: true; deductions: { productId: string; milli: number }[] }
  | { ok: false; shortages: StockShortage[] }

/**
 * Cuánto stock descontar por producto y si alcanza. Función pura: el repositorio la usa dentro
 * de la transacción, con los productos bloqueados, así que `stock` es el valor real.
 *
 * - Un producto repetido en varias líneas se suma: se valida y se descuenta una sola vez.
 * - Si faltan unidades, devuelve TODOS los productos que no alcanzan (no solo el primero),
 *   para que quien factura corrija todo de una vez.
 * - Con `allowNegativeStock` nunca rechaza: el stock puede quedar bajo cero.
 * - Cantidades en milésimas (enteros): sin errores de coma flotante.
 */
export function planStockDeductions(
  requests: StockRequest[],
  stockByProduct: ReadonlyMap<string, number | string>,
  allowNegativeStock: boolean,
): StockPlan {
  const totals = new Map<string, { name: string; unit: string; milli: number }>()
  for (const request of requests) {
    const current = totals.get(request.productId)
    const milli = toMilli(request.quantity)
    if (current) current.milli += milli
    else totals.set(request.productId, { name: request.name, unit: request.unit, milli })
  }

  const deductions: { productId: string; milli: number }[] = []
  const shortages: StockShortage[] = []

  for (const [productId, { name, unit, milli }] of totals) {
    const available = toMilli(stockByProduct.get(productId) ?? 0)
    if (!allowNegativeStock && milli > available) {
      shortages.push({ productId, name, unit, available, requested: milli })
    }
    deductions.push({ productId, milli })
  }

  return shortages.length > 0 ? { ok: false, shortages } : { ok: true, deductions }
}
