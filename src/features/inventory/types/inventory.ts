export type ProductRow = {
  id: string
  sku: string
  barcode: string | null
  name: string
  description: string | null
  unit: string
  price: number
  cost: number
  minStock: number
  trackStock: boolean
  active: boolean
  categoryId: string | null
  categoryName: string | null
  stock: number
  createdAt: string // ISO
}

// Qué productos listar: los vigentes, los archivados o todos.
export type ProductStatus = 'active' | 'archived' | 'all'

export type CategoryRow = {
  id: string
  name: string
  productCount: number
}

// Cuántos movimientos recientes muestra el historial de un producto
export const HISTORY_LIMIT = 50

export type MovementType = 'in' | 'out' | 'adjustment'

// Entrada/salida: `quantity` es la cantidad que entra o sale.
// Ajuste: `quantity` es el stock real contado; el sistema calcula la diferencia.
export type MovementInput = {
  productId: string
  type: MovementType
  quantity: number
  reason: string
}

export type MovementRow = {
  id: string
  type: MovementType
  delta: number
  reason: string | null
  createdAt: string // ISO
  userName: string | null
}

// Estado del producto en el momento de decidir un movimiento (leído con el producto bloqueado).
export type StockState = { stock: number; trackStock: boolean; active: boolean }

// Decisión de la regla de negocio: registrar este movimiento o rechazarlo.
export type MovementPlan =
  | { ok: true; type: MovementType; delta: string; reason: string | null }
  | { ok: false; error: string }

export type HistoryResult = { error: string; items: MovementRow[] }
