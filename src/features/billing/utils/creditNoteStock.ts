import { toMilli } from '@/features/inventory/utils/stockMath'

export type RestockLine = {
  productId: string | null
  quantity: number
  tracksStock: boolean // si la línea original controlaba stock
  restock: boolean // si quien emite la nota eligió devolver esas unidades al inventario
}

/**
 * Cuánto stock devolver por producto al emitir una nota de crédito. Función pura.
 * - Solo cuentan las líneas con `restock` y que controlan stock (la base también lo exige).
 * - Un producto repetido en varias líneas se suma: un solo movimiento por producto.
 * - Cantidades en milésimas (enteros): sin errores de coma flotante.
 * Devolver stock nunca puede faltar unidades, así que no hay "faltantes" como al vender.
 */
export function planRestock(lines: RestockLine[]): { productId: string; milli: number }[] {
  const totals = new Map<string, number>()
  for (const line of lines) {
    if (!line.restock || !line.tracksStock || line.productId === null) continue
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + toMilli(line.quantity))
  }
  return [...totals.entries()].filter(([, milli]) => milli > 0).map(([productId, milli]) => ({ productId, milli }))
}
