import {
  accessService,
  type IAccessResolver,
} from '@/features/organization/services/AccessService'
import type { MovementInput } from '../types/inventory'
import { decideMovement } from '../utils/stockRules'
import { stockRepository, type IStockRepository } from './StockRepository'

// Misma forma en éxito y error (`stock` es null cuando falla): el cliente lee `stock` sin comprobar la unión.
const fail = (error: string) => ({ error, success: '', stock: null })

const SUCCESS = {
  in: 'Entrada registrada',
  out: 'Salida registrada',
  adjustment: 'Ajuste registrado',
} as const

export class StockService {
  constructor(
    private stock: IStockRepository,
    private access: IAccessResolver,
  ) {}

  async register(userId: string, organizationId: string, input: MovementInput) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.write')
    if (!access) return fail('No tienes permisos para modificar el inventario')

    // Defensa en profundidad: el schema ya lo valida, pero la regla vive aquí
    if (input.type !== 'adjustment' && !(input.quantity > 0)) {
      return fail('La cantidad debe ser mayor a 0')
    }
    if (input.type === 'adjustment' && input.reason.trim().length < 3) {
      return fail('Indica el motivo del ajuste')
    }

    const result = await this.stock.record(
      access.organizationId,
      input.productId,
      userId,
      (state) => decideMovement(input, state), // la regla se evalúa dentro de la transacción
    )

    switch (result.status) {
      case 'not_found':
        return fail('El producto no existe')
      case 'rejected':
        return fail(result.error)
      case 'recorded':
        return { error: '', success: SUCCESS[input.type], stock: result.stock }
    }
  }

  async history(userId: string, organizationId: string, productId: string) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.read')
    return access ? this.stock.history(access.organizationId, productId) : []
  }
}

export const stockService = new StockService(stockRepository, accessService)
