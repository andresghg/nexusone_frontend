import { describe, expect, it } from 'vitest'
import { ProductFormSchema } from '../schemas/inventorySchema'
import type { ProductRow } from '../types/inventory'
import { emptyProductValues, productToFormValues } from './productForm'

const row = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: 'p-1', sku: 'COLA', barcode: null, name: 'Cola 1L', description: null, unit: 'un',
  price: 1500, cost: 900, minStock: 2, trackStock: true, active: true,
  categoryId: null, categoryName: null, stock: 5, createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
})

describe('emptyProductValues', () => {
  it('los valores por defecto son válidos salvo los campos obligatorios', () => {
    const result = ProductFormSchema.safeParse(emptyProductValues())
    expect(result.success).toBe(false)
    const paths = result.error?.issues.map((i) => i.path[0])
    expect(paths).toContain('sku')
    expect(paths).toContain('name')
    expect(paths).not.toContain('price')
    expect(paths).not.toContain('initialStock')
  })

  it('con SKU y nombre pasa la validación', () => {
    expect(ProductFormSchema.safeParse({ ...emptyProductValues(), sku: 'A', name: 'B' }).success).toBe(true)
  })
})

describe('productToFormValues', () => {
  it('convierte los null de la base de datos en textos vacíos', () => {
    const v = productToFormValues(row())
    expect(v).toMatchObject({ barcode: '', description: '', categoryId: '', initialStock: 0 })
  })

  it('un producto existente produce un formulario válido', () => {
    expect(ProductFormSchema.safeParse(productToFormValues(row())).success).toBe(true)
    expect(
      ProductFormSchema.safeParse(
        productToFormValues(row({ barcode: '7801', description: 'Botella', categoryId: '11111111-1111-4111-8111-111111111111' })),
      ).success,
    ).toBe(true)
  })

  it('una unidad desconocida cae a "un" para no bloquear la edición', () => {
    expect(productToFormValues(row({ unit: 'barril' })).unit).toBe('un')
    expect(productToFormValues(row({ unit: 'kg' })).unit).toBe('kg')
  })
})
