import type { ProductRow } from '../types/inventory'

export type StockStatus = 'untracked' | 'out' | 'low' | 'ok'

/**
 * Estado de stock para mostrar. Es coherente con el filtro "Stock bajo" del repositorio
 * (controla stock y stock <= mínimo): ese filtro devuelve justo los 'out' y los 'low'.
 */
export function getStockStatus(product: Pick<ProductRow, 'trackStock' | 'stock' | 'minStock'>): StockStatus {
  if (!product.trackStock) return 'untracked'
  if (product.stock <= 0) return 'out'
  if (product.minStock > 0 && product.stock <= product.minStock) return 'low'
  return 'ok'
}
