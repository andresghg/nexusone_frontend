import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setProductsTaxRateAction } from './product-action'

const { setTaxRateInBulk, getAuthUserId, revalidatePath } = vi.hoisted(() => ({
  setTaxRateInBulk: vi.fn(),
  getAuthUserId: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('../services/ProductService', () => ({ productService: { setTaxRateInBulk } }))
vi.mock('@/lib/supabase/get-user-id', () => ({ getAuthUserId }))
vi.mock('next/cache', () => ({ revalidatePath }))

const ORG = '11111111-1111-4111-8111-111111111111'
const CAT = '22222222-2222-4222-8222-222222222222'
const input = (over: object = {}) => ({
  organizationId: ORG,
  filters: { status: 'active' as const },
  taxRate: '0',
  expectedCount: 12,
  ...over,
})

beforeEach(() => {
  setTaxRateInBulk.mockReset()
  getAuthUserId.mockReset().mockResolvedValue('user-1')
  revalidatePath.mockReset()
})

describe('setProductsTaxRateAction · validación', () => {
  it.each([
    ['empresa inválida', { organizationId: 'x' }, 'Empresa inválida'],
    ['categoría inválida', { filters: { status: 'active', categoryId: 'x' } }, 'Categoría inválida'],
    ['estado desconocido', { filters: { status: 'otro' } }, null],
    ['impuesto mayor a 100', { taxRate: '101' }, 'El impuesto debe ser un número entre 0 y 100, con máximo 2 decimales'],
    ['impuesto con texto', { taxRate: 'abc' }, 'El impuesto debe ser un número entre 0 y 100, con máximo 2 decimales'],
    ['sin productos', { expectedCount: 0 }, 'No hay productos para actualizar'],
    ['total no entero', { expectedCount: 1.5 }, 'La cantidad de productos es inválida'],
    ['total no numérico', { expectedCount: '12' }, 'La cantidad de productos es inválida'],
    ['demasiados productos', { expectedCount: 5001 }, 'Son demasiados productos: filtra la lista a 5.000 o menos'],
    ['búsqueda demasiado larga', { filters: { status: 'active', search: 'a'.repeat(101) } }, null],
  ])('%s: se rechaza sin tocar el servicio ni pedir sesión', async (_name, over, message) => {
    const result = await setProductsTaxRateAction(input(over) as never)
    expect(result.success).toBe('')
    expect(result.error).toBe(message ?? result.error)
    expect(result.error).not.toBe('')
    expect(setTaxRateInBulk).not.toHaveBeenCalled()
    expect(getAuthUserId).not.toHaveBeenCalled()
  })

  it('acepta vacío (tasa de la empresa), exento y tasas con coma o punto', async () => {
    setTaxRateInBulk.mockResolvedValue({ error: '', success: 'ok' })
    for (const taxRate of ['', '0', '19', '5,5', '10.25', '100']) {
      expect((await setProductsTaxRateAction(input({ taxRate }))).error).toBe('')
    }
    expect(setTaxRateInBulk).toHaveBeenCalledTimes(6)
  })

  it('acepta exactamente 5.000 productos', async () => {
    setTaxRateInBulk.mockResolvedValue({ error: '', success: 'ok' })
    expect((await setProductsTaxRateAction(input({ expectedCount: 5000 }))).error).toBe('')
  })
})

describe('setProductsTaxRateAction · ejecución', () => {
  it('sin sesión no cambia nada', async () => {
    getAuthUserId.mockResolvedValue(undefined)
    expect(await setProductsTaxRateAction(input())).toEqual({ error: 'Sesión no válida', success: '' })
    expect(setTaxRateInBulk).not.toHaveBeenCalled()
  })

  it('llama al servicio con el usuario de la sesión y separa la empresa del resto', async () => {
    setTaxRateInBulk.mockResolvedValue({ error: '', success: 'Impuesto actualizado: 12 productos quedaron exentos' })
    const result = await setProductsTaxRateAction(
      input({ filters: { status: 'all', search: ' pan ', categoryId: CAT, lowStock: true } }),
    )
    expect(result).toEqual({ error: '', success: 'Impuesto actualizado: 12 productos quedaron exentos' })
    expect(setTaxRateInBulk).toHaveBeenCalledWith('user-1', ORG, {
      filters: { status: 'all', search: 'pan', categoryId: CAT, lowStock: true },
      taxRate: '0',
      expectedCount: 12,
    })
  })

  it('al terminar bien refresca el inventario y la pantalla de nueva factura', async () => {
    setTaxRateInBulk.mockResolvedValue({ error: '', success: 'ok' })
    await setProductsTaxRateAction(input())
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/inventario', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/facturacion/nueva', 'page')
  })

  it('si el servicio rechaza (permiso, lista cambiada), devuelve su mensaje y no refresca nada', async () => {
    setTaxRateInBulk.mockResolvedValue({ error: 'La lista cambió: ahora tiene 13 productos y habías confirmado 12. Revísala y vuelve a intentarlo', success: '' })
    const result = await setProductsTaxRateAction(input())
    expect(result.error).toContain('La lista cambió')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un error inesperado no se filtra: mensaje genérico', async () => {
    setTaxRateInBulk.mockRejectedValue(new Error('connection refused at 10.0.0.5'))
    expect(await setProductsTaxRateAction(input())).toEqual({
      error: 'No se pudo actualizar el impuesto de los productos',
      success: '',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
