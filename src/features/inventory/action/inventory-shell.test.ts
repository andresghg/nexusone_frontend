import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProductAction, setProductActiveAction, updateProductAction } from './product-action'
import { registerMovementAction } from './stock-action'

// El badge de stock bajo del sidebar y la campana viven en el layout: tras cambiar stock o productos hay que refrescarlo
const { create, update, setActive, register, getAuthUserId, revalidatePath } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  register: vi.fn(),
  getAuthUserId: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('../services/ProductService', () => ({ productService: { create, update, setActive } }))
vi.mock('../services/StockService', () => ({ stockService: { register } }))
vi.mock('@/lib/supabase/get-user-id', () => ({ getAuthUserId }))
vi.mock('next/cache', () => ({ revalidatePath }))

const ORG = '11111111-1111-4111-8111-111111111111'
const PRODUCT = '33333333-3333-4333-8333-333333333333'
const LAYOUT = ['/dashboard/[slug]', 'layout']

const product = {
  organizationId: ORG, sku: 'CAB-1', barcode: '', name: 'Cable', description: '', unit: 'un' as const, categoryId: '',
  price: 1000, cost: 500, taxRate: '', minStock: 2, trackStock: true, active: true,
}

beforeEach(() => {
  for (const fn of [create, update, setActive, register, revalidatePath]) fn.mockReset()
  getAuthUserId.mockReset().mockResolvedValue('user-1')
})

const actions: [string, () => Promise<unknown>, ReturnType<typeof vi.fn>][] = [
  ['crear producto', () => createProductAction({ ...product, initialStock: 5 }), create],
  ['editar producto', () => updateProductAction({ ...product, productId: PRODUCT }), update],
  ['archivar o activar producto', () => setProductActiveAction({ organizationId: ORG, productId: PRODUCT, active: false }), setActive],
  ['registrar un movimiento de stock', () => registerMovementAction({ organizationId: ORG, productId: PRODUCT, type: 'in', quantity: 3, reason: '' }), register],
]

describe.each(actions)('%s', (_name, run, service) => {
  it('con éxito refresca el inventario y el layout (badge de stock bajo y campana)', async () => {
    service.mockResolvedValue({ error: '', success: 'ok' })
    await run()
    expect(service).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/inventario', 'page')
    expect(revalidatePath).toHaveBeenCalledWith(...LAYOUT)
  })

  it('si el servicio rechaza no refresca nada', async () => {
    service.mockResolvedValue({ error: 'No se pudo', success: '' })
    await run()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si el servicio lanza no refresca nada', async () => {
    service.mockRejectedValue(new Error('boom'))
    await run()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('sin sesión no toca el servicio ni refresca', async () => {
    getAuthUserId.mockResolvedValue(undefined)
    await run()
    expect(service).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
