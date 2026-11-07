import type { MovementInput, MovementPlan, StockState } from '../types/inventory'
import { formatQuantity, fromMilli, milliToNumber, toMilli } from './stockMath'

const reject = (error: string): MovementPlan => ({ ok: false, error })

/**
 * Reglas de stock. Función pura: la usa el service (dentro de la transacción, con el producto
 * bloqueado, así que `stock` es el valor real) y el diálogo del navegador (para mostrar el
 * resultado antes de enviar). Una sola regla, dos usos: no pueden contradecirse.
 */
export function decideMovement(input: MovementInput, state: StockState): MovementPlan {
  const { stock, trackStock, active } = state
  if (!trackStock) return reject('Este producto no controla stock')
  if (!active) return reject('El producto está archivado')

  const current = toMilli(stock)
  const quantity = toMilli(input.quantity)
  const reason = input.reason.trim() || null

  switch (input.type) {
    case 'in':
      if (quantity <= 0) return reject('La cantidad debe ser mayor a 0')
      return { ok: true, type: 'in', delta: fromMilli(quantity), reason }

    case 'out':
      if (quantity <= 0) return reject('La cantidad debe ser mayor a 0')
      // Política actual: el stock no puede quedar negativo
      if (quantity > current) {
        return reject(`Stock insuficiente (disponible: ${formatQuantity(current)})`)
      }
      return { ok: true, type: 'out', delta: fromMilli(-quantity), reason }

    case 'adjustment': {
      // `quantity` es el stock real contado: se registra la diferencia
      const delta = quantity - current
      if (delta === 0) return reject('El stock ya coincide con el conteo')
      return { ok: true, type: 'adjustment', delta: fromMilli(delta), reason }
    }
  }
}

export type MovementPreview =
  | { status: 'idle' } // todavía no hay una cantidad válida que mostrar
  | { status: 'rejected'; error: string }
  | { status: 'ok'; delta: number; result: number }

/** Resultado previsto de un movimiento, para mostrarlo mientras el usuario escribe. */
export function previewMovement(
  input: Pick<MovementInput, 'type' | 'quantity' | 'reason'>,
  state: StockState,
): MovementPreview {
  const { type, quantity } = input
  if (!Number.isFinite(quantity) || quantity < 0) return { status: 'idle' }
  if (type !== 'adjustment' && quantity === 0) return { status: 'idle' }

  const plan = decideMovement({ productId: '', ...input }, state)
  if (!plan.ok) return { status: 'rejected', error: plan.error }

  return {
    status: 'ok',
    delta: Number(plan.delta),
    result: milliToNumber(toMilli(state.stock) + toMilli(plan.delta)),
  }
}
