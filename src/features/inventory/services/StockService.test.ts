import { describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/types/navigation'
import type { IAccessResolver } from '@/features/organization/services/AccessService'
import type { MovementInput } from '../types/inventory'
import { milliToNumber, toMilli } from '../utils/stockMath'
import { StockService } from './StockService'
import type {
  IStockRepository,
  MovementPlan,
  RecordResult,
  StockState,
} from './StockRepository'

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'
const PRODUCT_ID = 'p-1'

const movement = (over: Partial<MovementInput> = {}): MovementInput => ({
  productId: PRODUCT_ID,
  type: 'in',
  quantity: 5,
  reason: '',
  ...over,
})

// El repositorio falso hace lo que el real: entrega el estado al "decide" del service y
// traduce su decisión. Así se prueban las reglas de stock sin base de datos.
function setup(
  state: Partial<StockState> = {},
  granted: Permission[] = ['pos.inventario.read', 'pos.inventario.write'],
) {
  const current: StockState = { stock: 10, trackStock: true, active: true, ...state }
  const plans: MovementPlan[] = []

  const stock = {
    record: vi.fn(
      async (
        _organizationId: string,
        _productId: string,
        _userId: string,
        decide: (s: StockState) => MovementPlan,
      ): Promise<RecordResult> => {
        const plan = decide(current)
        plans.push(plan)
        if (!plan.ok) return { status: 'rejected', error: plan.error }
        return {
          status: 'recorded',
          stock: milliToNumber(toMilli(current.stock) + toMilli(plan.delta)),
        }
      },
    ),
    history: vi.fn().mockResolvedValue([]),
  } satisfies IStockRepository

  const access = {
    authorize: vi.fn(async (_userId: string, organizationId: string, permission: Permission) =>
      organizationId === ORG_ID && granted.includes(permission)
        ? { organizationId: ORG_ID, role: 'member', permissions: granted }
        : null,
    ),
  } satisfies IAccessResolver

  return { stock, access, plans, service: new StockService(stock, access) }
}

describe('StockService.register · entradas', () => {
  it('suma al stock y registra la entrada', async () => {
    const { stock, plans, service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ quantity: 5, reason: ' compra ' }))
    expect(result).toEqual({ error: '', success: 'Entrada registrada', stock: 15 })
    expect(plans[0]).toEqual({ ok: true, type: 'in', delta: '5.000', reason: 'compra' })
    expect(stock.record).toHaveBeenCalledWith(ORG_ID, PRODUCT_ID, 'u1', expect.any(Function))
  })

  it('el motivo vacío se guarda como null', async () => {
    const { plans, service } = setup()
    await service.register('u1', ORG_ID, movement())
    expect(plans[0]).toMatchObject({ reason: null })
  })

  it('suma decimales sin errores de coma flotante (0.1 + 0.2 = 0.3)', async () => {
    const { service } = setup({ stock: 0.1 })
    const result = await service.register('u1', ORG_ID, movement({ quantity: 0.2 }))
    expect(result.stock).toBe(0.3)
  })
})

describe('StockService.register · salidas', () => {
  it('resta del stock', async () => {
    const { plans, service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type: 'out', quantity: 4 }))
    expect(result).toEqual({ error: '', success: 'Salida registrada', stock: 6 })
    expect(plans[0]).toMatchObject({ type: 'out', delta: '-4.000' })
  })

  it('permite dejar el stock exactamente en cero', async () => {
    const { service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type: 'out', quantity: 10 }))
    expect(result.error).toBe('')
    expect(result.stock).toBe(0)
  })

  it('rechaza una salida mayor al stock disponible (no hay stock negativo)', async () => {
    const { plans, service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type: 'out', quantity: 10.5 }))
    expect(result.error).toBe('Stock insuficiente (disponible: 10)')
    expect(plans[0]).toEqual({ ok: false, error: 'Stock insuficiente (disponible: 10)' })
  })

  it('con decimales: sacar 0.3 de 0.1 + 0.2 deja el stock en cero', async () => {
    const { service } = setup({ stock: 0.30000000000000004 })
    const result = await service.register('u1', ORG_ID, movement({ type: 'out', quantity: 0.3 }))
    expect(result.error).toBe('')
    expect(result.stock).toBe(0)
  })
})

describe('StockService.register · ajustes por conteo', () => {
  it('sube el stock al valor contado registrando la diferencia', async () => {
    const { plans, service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type: 'adjustment', quantity: 12, reason: 'Conteo mensual' }))
    expect(result).toEqual({ error: '', success: 'Ajuste registrado', stock: 12 })
    expect(plans[0]).toMatchObject({ type: 'adjustment', delta: '2.000', reason: 'Conteo mensual' })
  })

  it('baja el stock al valor contado (merma)', async () => {
    const { plans, service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type: 'adjustment', quantity: 7, reason: 'Merma' }))
    expect(result.stock).toBe(7)
    expect(plans[0]).toMatchObject({ delta: '-3.000' })
  })

  it('permite contar cero', async () => {
    const { service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type: 'adjustment', quantity: 0, reason: 'Sin existencias' }))
    expect(result.error).toBe('')
    expect(result.stock).toBe(0)
  })

  it('rechaza un conteo igual al stock (no hay nada que ajustar)', async () => {
    const { service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type: 'adjustment', quantity: 10, reason: 'Conteo' }))
    expect(result.error).toBe('El stock ya coincide con el conteo')
  })

  it('exige un motivo y no toca la base de datos sin él', async () => {
    const { stock, service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type: 'adjustment', quantity: 7, reason: '  ' }))
    expect(result.error).toBe('Indica el motivo del ajuste')
    expect(stock.record).not.toHaveBeenCalled()
  })
})

describe('StockService.register · validaciones y estados', () => {
  it.each(['in', 'out'] as const)('una %s de cantidad 0 se rechaza', async (type) => {
    const { stock, service } = setup()
    const result = await service.register('u1', ORG_ID, movement({ type, quantity: 0 }))
    expect(result.error).toBe('La cantidad debe ser mayor a 0')
    expect(stock.record).not.toHaveBeenCalled()
  })

  it('un producto que no controla stock no admite movimientos', async () => {
    const { service } = setup({ trackStock: false })
    expect((await service.register('u1', ORG_ID, movement())).error).toBe('Este producto no controla stock')
  })

  it('un producto archivado no admite movimientos', async () => {
    const { service } = setup({ active: false })
    expect((await service.register('u1', ORG_ID, movement())).error).toBe('El producto está archivado')
  })

  it('avisa si el producto no existe o es de otra empresa', async () => {
    const { stock, service } = setup()
    stock.record.mockResolvedValueOnce({ status: 'not_found' })
    expect((await service.register('u1', ORG_ID, movement())).error).toBe('El producto no existe')
  })
})

describe('StockService · permisos y aislamiento', () => {
  it('un member (solo lectura) no puede registrar movimientos', async () => {
    const { stock, service } = setup({}, ['pos.inventario.read'])
    const result = await service.register('u1', ORG_ID, movement())
    expect(result.error).toBe('No tienes permisos para modificar el inventario')
    expect(stock.record).not.toHaveBeenCalled()
  })

  it('ser dueño de otra empresa no permite mover stock en esta', async () => {
    const { stock, service } = setup()
    const result = await service.register('u1', OTHER_ORG_ID, movement())
    expect(result.error).toBe('No tienes permisos para modificar el inventario')
    expect(stock.record).not.toHaveBeenCalled()
  })

  it('el historial exige permiso de lectura y consulta la empresa del acceso', async () => {
    const ok = setup({}, ['pos.inventario.read'])
    await ok.service.history('u1', ORG_ID, PRODUCT_ID)
    expect(ok.stock.history).toHaveBeenCalledWith(ORG_ID, PRODUCT_ID)

    const none = setup({}, ['pos.inventario.write'])
    expect(await none.service.history('u1', ORG_ID, PRODUCT_ID)).toEqual([])
    expect(none.stock.history).not.toHaveBeenCalled()

    const other = setup()
    expect(await other.service.history('u1', OTHER_ORG_ID, PRODUCT_ID)).toEqual([])
    expect(other.stock.history).not.toHaveBeenCalled()
  })
})
