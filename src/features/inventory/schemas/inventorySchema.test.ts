import { describe, expect, it } from 'vitest'
import {
  CreateProductSchema,
  MovementFormSchema,
  ProductHistorySchema,
  ProductSchema,
  StockMovementSchema,
} from './inventorySchema'

const ORG = '11111111-1111-4111-8111-111111111111'
const PRODUCT = '22222222-2222-4222-8222-222222222222'

const product = (over: Record<string, unknown> = {}) => ({
  sku: 'COLA-1L', barcode: '', name: 'Cola 1L', description: '', unit: 'un', categoryId: '',
  price: 1500, cost: 900, minStock: 2, trackStock: true, active: true,
  ...over,
})

const movement = (over: Record<string, unknown> = {}) => ({
  organizationId: ORG, productId: PRODUCT, type: 'in', quantity: 5, reason: '',
  ...over,
})

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message

describe('StockMovementSchema', () => {
  it('acepta entradas, salidas y ajustes válidos', () => {
    expect(StockMovementSchema.safeParse(movement()).success).toBe(true)
    expect(StockMovementSchema.safeParse(movement({ type: 'out', quantity: 0.5 })).success).toBe(true)
    expect(StockMovementSchema.safeParse(movement({ type: 'adjustment', quantity: 0, reason: 'Sin stock' })).success).toBe(true)
  })

  it.each(['in', 'out'])('una %s exige cantidad mayor a 0', (type) => {
    const result = StockMovementSchema.safeParse(movement({ type, quantity: 0 }))
    expect(result.success).toBe(false)
    expect(firstError(result)).toBe('La cantidad debe ser mayor a 0')
  })

  it('un ajuste exige motivo', () => {
    const result = StockMovementSchema.safeParse(movement({ type: 'adjustment', quantity: 3, reason: ' ab ' }))
    expect(result.success).toBe(false)
    expect(firstError(result)).toBe('Indica el motivo del ajuste')
  })

  it('rechaza más de 3 decimales, negativos y cantidades que no caben en la base de datos', () => {
    expect(StockMovementSchema.safeParse(movement({ quantity: 1.2345 })).success).toBe(false)
    expect(StockMovementSchema.safeParse(movement({ quantity: -1 })).success).toBe(false)
    expect(StockMovementSchema.safeParse(movement({ quantity: 100_000_000 })).success).toBe(false)
    expect(StockMovementSchema.safeParse(movement({ quantity: 0.001 })).success).toBe(true)
  })

  it('rechaza tipo, producto o empresa inválidos', () => {
    expect(StockMovementSchema.safeParse(movement({ type: 'robo' })).success).toBe(false)
    expect(StockMovementSchema.safeParse(movement({ productId: 'abc' })).success).toBe(false)
    expect(StockMovementSchema.safeParse(movement({ organizationId: 'abc' })).success).toBe(false)
  })
})

describe('ProductSchema', () => {
  it('acepta un producto válido', () => {
    expect(ProductSchema.safeParse(product()).success).toBe(true)
  })

  it('exige SKU y nombre, y una unidad conocida', () => {
    expect(ProductSchema.safeParse(product({ sku: '  ' })).success).toBe(false)
    expect(ProductSchema.safeParse(product({ name: '' })).success).toBe(false)
    expect(ProductSchema.safeParse(product({ unit: 'barril' })).success).toBe(false)
  })

  it('el stock mínimo no puede desbordar la columna numeric(14,3)', () => {
    expect(ProductSchema.safeParse(product({ minStock: 99_999_999 })).success).toBe(true)
    expect(ProductSchema.safeParse(product({ minStock: 100_000_000 })).success).toBe(false)
    expect(ProductSchema.safeParse(product({ minStock: 1.0005 })).success).toBe(false)
  })

  it('rechaza precios negativos o que no son número', () => {
    expect(ProductSchema.safeParse(product({ price: -1 })).success).toBe(false)
    expect(ProductSchema.safeParse(product({ price: Number.NaN })).success).toBe(false)
  })

  it('la categoría puede ir vacía o ser un uuid', () => {
    expect(ProductSchema.safeParse(product({ categoryId: PRODUCT })).success).toBe(true)
    expect(ProductSchema.safeParse(product({ categoryId: 'no-uuid' })).success).toBe(false)
  })
})

describe('CreateProductSchema', () => {
  it('pide la empresa y un stock inicial (0 si no hay)', () => {
    expect(CreateProductSchema.safeParse({ ...product(), organizationId: ORG, initialStock: 0 }).success).toBe(true)
    expect(CreateProductSchema.safeParse({ ...product(), organizationId: ORG }).success).toBe(false)
    expect(CreateProductSchema.safeParse({ ...product(), organizationId: ORG, initialStock: -5 }).success).toBe(false)
  })
})

describe('MovementFormSchema (lo que valida el diálogo)', () => {
  const form = (over: Record<string, unknown> = {}) => ({ type: 'in', quantity: 5, reason: '', ...over })

  it('aplica las mismas reglas que el servidor', () => {
    expect(MovementFormSchema.safeParse(form()).success).toBe(true)
    expect(firstError(MovementFormSchema.safeParse(form({ quantity: 0 })))).toBe('La cantidad debe ser mayor a 0')
    expect(firstError(MovementFormSchema.safeParse(form({ type: 'adjustment', quantity: 3, reason: 'ab' })))).toBe('Indica el motivo del ajuste')
    expect(MovementFormSchema.safeParse(form({ type: 'adjustment', quantity: 0, reason: 'Sin stock' })).success).toBe(true)
    expect(MovementFormSchema.safeParse(form({ quantity: 1.2345 })).success).toBe(false)
  })

  it('no incluye empresa ni producto: los pone el sistema', () => {
    expect(MovementFormSchema.safeParse(form()).success).toBe(true)
    expect(MovementFormSchema.safeParse({ ...form(), organizationId: 'x', productId: 'y' }).success).toBe(true) // se ignoran
  })
})

describe('ProductHistorySchema', () => {
  it('exige empresa y producto válidos', () => {
    expect(ProductHistorySchema.safeParse({ organizationId: ORG, productId: PRODUCT }).success).toBe(true)
    expect(ProductHistorySchema.safeParse({ organizationId: ORG, productId: 'x' }).success).toBe(false)
    expect(ProductHistorySchema.safeParse({ productId: PRODUCT }).success).toBe(false)
  })
})
