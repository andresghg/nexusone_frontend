import { describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/types/navigation'
import type { IAccessResolver } from '@/features/organization/services/AccessService'
import type { ProductInput } from '../schemas/inventorySchema'
import { ProductService } from './ProductService'
import type { IProductRepository } from './ProductRepository'

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111'

const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  sku: 'cola-1l',
  barcode: '',
  name: '  Cola 1L  ',
  description: '',
  unit: 'un',
  categoryId: '',
  price: 1500,
  cost: 900.5,
  taxRate: '',
  minStock: 2,
  trackStock: true,
  active: true,
  ...over,
})

// El usuario solo tiene `granted` en ORG_ID; en cualquier otra empresa no tiene acceso.
function setup(granted: Permission[] = ['pos.inventario.read', 'pos.inventario.write']) {
  const products = {
    findAll: vi.fn().mockResolvedValue([]),
    findPage: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    findById: vi.fn(),
    categoryExists: vi.fn().mockResolvedValue(true),
    create: vi.fn().mockResolvedValue({ id: 'p-1' }),
    update: vi.fn().mockResolvedValue(true),
    setActive: vi.fn().mockResolvedValue(true),
    getLowStockCount: vi.fn().mockResolvedValue(0),
    setTaxRateByFilters: vi.fn().mockResolvedValue({ status: 'updated', count: 3 }),
  } satisfies IProductRepository

  const access = {
    authorize: vi.fn(async (_userId: string, organizationId: string, permission: Permission) =>
      organizationId === ORG_ID && granted.includes(permission)
        ? { organizationId: ORG_ID, role: 'member', permissions: granted }
        : null,
    ),
  } satisfies IAccessResolver

  return { products, access, service: new ProductService(products, access) }
}

const pgError = (constraint: string, code = '23505') => Object.assign(new Error('pg'), { code, constraint_name: constraint })

describe('ProductService.list', () => {
  it('con permiso de lectura consulta la empresa del acceso con filtros y paginación', async () => {
    const { products, access, service } = setup(['pos.inventario.read'])
    products.findPage.mockResolvedValue({ rows: [], total: 7 })
    const result = await service.list('u1', ORG_ID, { search: 'cola' }, { page: 2, pageSize: 10 })
    expect(access.authorize).toHaveBeenCalledWith('u1', ORG_ID, 'pos.inventario.read')
    expect(products.findPage).toHaveBeenCalledWith(ORG_ID, { search: 'cola' }, { page: 2, pageSize: 10 })
    expect(result.total).toBe(7)
  })

  it('usa 25 por página y la primera página por defecto', async () => {
    const { products, service } = setup(['pos.inventario.read'])
    await service.list('u1', ORG_ID)
    expect(products.findPage).toHaveBeenCalledWith(ORG_ID, {}, { page: 1, pageSize: 25 })
  })

  it('normaliza páginas absurdas que vienen de la URL', async () => {
    const { products, service } = setup(['pos.inventario.read'])
    await service.list('u1', ORG_ID, {}, { page: -3, pageSize: 10_000_000 })
    await service.list('u1', ORG_ID, {}, { page: Number.NaN, pageSize: 0 })
    await service.list('u1', ORG_ID, {}, { page: 2.9, pageSize: 7.5 })
    expect(products.findPage.mock.calls.map((c) => c[2])).toEqual([
      { page: 1, pageSize: 100 },
      { page: 1, pageSize: 1 },
      { page: 2, pageSize: 7 },
    ])
  })

  it('sin permiso, o en otra empresa, devuelve vacío sin consultar', async () => {
    const noRead = setup(['pos.inventario.write'])
    expect(await noRead.service.list('u1', ORG_ID)).toEqual({ rows: [], total: 0 })
    expect(noRead.products.findPage).not.toHaveBeenCalled()

    const other = setup()
    expect(await other.service.list('u1', OTHER_ORG_ID)).toEqual({ rows: [], total: 0 })
    expect(other.products.findPage).not.toHaveBeenCalled()
  })
})

describe('ProductService.create', () => {
  it('sin permiso de escritura no crea nada (un member solo lee)', async () => {
    const { products, service } = setup(['pos.inventario.read'])
    const result = await service.create('u1', ORG_ID, input())
    expect(result.error).toBe('No tienes permisos para modificar el inventario')
    expect(products.create).not.toHaveBeenCalled()
  })

  it('ser dueño de otra empresa no permite escribir en esta', async () => {
    const { products, service } = setup()
    const result = await service.create('u1', OTHER_ORG_ID, input())
    expect(result.error).toBe('No tienes permisos para modificar el inventario')
    expect(products.create).not.toHaveBeenCalled()
    expect(products.categoryExists).not.toHaveBeenCalled()
  })

  it('normaliza: SKU en mayúsculas, vacíos a null, números con decimales de la base', async () => {
    const { products, service } = setup()
    const result = await service.create('u1', ORG_ID, input())
    expect(result.error).toBe('')
    expect(products.create).toHaveBeenCalledWith(ORG_ID, {
      categoryId: null,
      sku: 'COLA-1L',
      barcode: null,
      name: 'Cola 1L',
      description: null,
      unit: 'un',
      price: '1500.00',
      cost: '900.50',
      taxRate: null,
      minStock: '2.000',
      trackStock: true,
      active: true,
    })
  })

  it('verifica que la categoría sea de la empresa antes de crear', async () => {
    const { products, service } = setup()
    products.categoryExists.mockResolvedValue(false)
    const result = await service.create('u1', ORG_ID, input({ categoryId: CATEGORY_ID }))
    expect(result.error).toBe('La categoría no existe')
    expect(products.categoryExists).toHaveBeenCalledWith(ORG_ID, CATEGORY_ID)
    expect(products.create).not.toHaveBeenCalled()
  })

  it('traduce SKU y código de barras repetidos', async () => {
    const sku = setup()
    sku.products.create.mockRejectedValue(pgError('products_organization_id_sku_key'))
    expect((await sku.service.create('u1', ORG_ID, input())).error).toBe('Ya existe un producto con ese SKU')

    const bar = setup()
    bar.products.create.mockRejectedValue(pgError('products_org_barcode_key'))
    expect((await bar.service.create('u1', ORG_ID, input())).error).toBe('Ya existe un producto con ese código de barras')
  })

  it('traduce una categoría inexistente detectada por la base de datos', async () => {
    const { products, service } = setup()
    products.create.mockRejectedValue(pgError('products_organization_id_category_id_fkey', '23503'))
    expect((await service.create('u1', ORG_ID, input())).error).toBe('La categoría no existe')
  })

  it('relanza los errores que no sabe traducir', async () => {
    const { products, service } = setup()
    products.create.mockRejectedValue(new Error('boom'))
    await expect(service.create('u1', ORG_ID, input())).rejects.toThrow('boom')
  })
})

describe('ProductService.create · impuesto del producto', () => {
  const sentTaxRate = async (taxRate: string) => {
    const { products, service } = setup()
    expect((await service.create('u1', ORG_ID, input({ taxRate }))).error).toBe('')
    return products.create.mock.calls[0][1].taxRate
  }

  it('vacío se guarda como null: el producto usa la tasa de la empresa', async () => {
    expect(await sentTaxRate('')).toBeNull()
    expect(await sentTaxRate('   ')).toBeNull()
  })

  it('0 se guarda como "0.00": el producto está exento (no es lo mismo que vacío)', async () => {
    expect(await sentTaxRate('0')).toBe('0.00')
  })

  it('una tasa se guarda con 2 decimales, aceptando coma', async () => {
    expect(await sentTaxRate('19')).toBe('19.00')
    expect(await sentTaxRate('10,5')).toBe('10.50')
    expect(await sentTaxRate('7.25')).toBe('7.25')
  })

  it('un valor que no es una tasa nunca se guarda (ni como exento por accidente)', async () => {
    for (const taxRate of ['abc', '-1', '101', '10.555', '1e2', 'NaN']) {
      const { products, service } = setup()
      await expect(service.create('u1', ORG_ID, input({ taxRate })), taxRate).rejects.toThrow('Impuesto inválido')
      expect(products.create).not.toHaveBeenCalled()
    }
  })

  it('al actualizar también se guarda', async () => {
    const { products, service } = setup()
    await service.update('u1', ORG_ID, 'p-1', input({ taxRate: '0' }))
    expect(products.update.mock.calls[0][2].taxRate).toBe('0.00')
  })
})

describe('ProductService.update', () => {
  it('sin permiso no actualiza', async () => {
    const { products, service } = setup(['pos.inventario.read'])
    expect((await service.update('u1', ORG_ID, 'p-1', input())).error).not.toBe('')
    expect(products.update).not.toHaveBeenCalled()
  })

  it('actualiza dentro de la empresa del acceso', async () => {
    const { products, service } = setup()
    const result = await service.update('u1', ORG_ID, 'p-1', input())
    expect(result).toEqual({ error: '', success: 'Producto actualizado' })
    expect(products.update).toHaveBeenCalledWith(ORG_ID, 'p-1', expect.objectContaining({ sku: 'COLA-1L' }))
  })

  it('avisa si el producto no existe (o es de otra empresa)', async () => {
    const { products, service } = setup()
    products.update.mockResolvedValue(false)
    expect((await service.update('u1', ORG_ID, 'p-9', input())).error).toBe('El producto no existe')
  })

  it('traduce SKU repetido y verifica la categoría', async () => {
    const dup = setup()
    dup.products.update.mockRejectedValue(pgError('products_organization_id_sku_key'))
    expect((await dup.service.update('u1', ORG_ID, 'p-1', input())).error).toBe('Ya existe un producto con ese SKU')

    const cat = setup()
    cat.products.categoryExists.mockResolvedValue(false)
    expect((await cat.service.update('u1', ORG_ID, 'p-1', input({ categoryId: CATEGORY_ID }))).error).toBe('La categoría no existe')
    expect(cat.products.update).not.toHaveBeenCalled()
  })
})

describe('ProductService.setActive', () => {
  it('archiva y restaura', async () => {
    const { products, service } = setup()
    expect((await service.setActive('u1', ORG_ID, 'p-1', false)).success).toBe('Producto archivado')
    expect((await service.setActive('u1', ORG_ID, 'p-1', true)).success).toBe('Producto restaurado')
    expect(products.setActive).toHaveBeenNthCalledWith(1, ORG_ID, 'p-1', false)
  })

  it('exige permiso de escritura y que el producto exista', async () => {
    const denied = setup(['pos.inventario.read'])
    expect((await denied.service.setActive('u1', ORG_ID, 'p-1', false)).error).not.toBe('')
    expect(denied.products.setActive).not.toHaveBeenCalled()

    const missing = setup()
    missing.products.setActive.mockResolvedValue(false)
    expect((await missing.service.setActive('u1', ORG_ID, 'p-9', false)).error).toBe('El producto no existe')
  })
})

describe('ProductService.create con stock inicial', () => {
  it('registra el stock inicial junto con el producto, con el usuario y la cantidad normalizada', async () => {
    const { products, service } = setup()
    await service.create('u1', ORG_ID, input(), 12.5)
    expect(products.create).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ sku: 'COLA-1L' }),
      { quantity: '12.500', userId: 'u1' },
    )
  })

  it('sin stock inicial no pasa ningún movimiento', async () => {
    const { products, service } = setup()
    await service.create('u1', ORG_ID, input(), 0)
    expect(products.create.mock.calls[0]).toHaveLength(2)
  })

  it('un producto que no controla stock ignora el stock inicial', async () => {
    const { products, service } = setup()
    await service.create('u1', ORG_ID, input({ trackStock: false }), 20)
    expect(products.create.mock.calls[0]).toHaveLength(2)
  })
})

describe('ProductService.setTaxRateInBulk', () => {
  const CATEGORY_ID = '33333333-3333-4333-8333-333333333333'
  const request = (over: object = {}) => ({
    filters: { status: 'active' as const },
    taxRate: '0',
    expectedCount: 3,
    ...over,
  })

  it('exige permiso de escritura y no sale de la empresa a la que pertenece', async () => {
    const { products, service } = setup(['pos.inventario.read'])
    expect(await service.setTaxRateInBulk('u1', ORG_ID, request())).toEqual({
      error: 'No tienes permisos para modificar el inventario',
      success: '',
    })
    expect((await setup().service.setTaxRateInBulk('u1', OTHER_ORG_ID, request())).error).toBe(
      'No tienes permisos para modificar el inventario',
    )
    expect(products.setTaxRateByFilters).not.toHaveBeenCalled()
  })

  it('pasa al repositorio los filtros de la lista, limpios, y el total confirmado', async () => {
    const { products, service } = setup()
    await service.setTaxRateInBulk(
      'u1',
      ORG_ID,
      request({ filters: { search: '  libro ', categoryId: CATEGORY_ID, status: 'all', lowStock: false }, expectedCount: 12 }),
    )
    expect(products.categoryExists).toHaveBeenCalledWith(ORG_ID, CATEGORY_ID)
    expect(products.setTaxRateByFilters).toHaveBeenCalledWith(
      ORG_ID,
      { search: 'libro', categoryId: CATEGORY_ID, status: 'all', lowStock: undefined },
      '0.00',
      12,
    )
  })

  it.each([
    ['', null],
    ['0', '0.00'],
    ['19', '19.00'],
    ['5,5', '5.50'],
    ['10.25', '10.25'],
    ['100', '100.00'],
  ])('el impuesto "%s" se guarda como %s (vacío = tasa de la empresa, 0 = exento)', async (taxRate, saved) => {
    const { products, service } = setup()
    await service.setTaxRateInBulk('u1', ORG_ID, request({ taxRate }))
    expect(products.setTaxRateByFilters.mock.calls[0][2]).toBe(saved)
  })

  it.each(['101', '-1', 'abc', '1.234', '5%', ' 12 3'])('rechaza el impuesto "%s" sin tocar nada', async (taxRate) => {
    const { products, service } = setup()
    const result = await service.setTaxRateInBulk('u1', ORG_ID, request({ taxRate }))
    expect(result.error).toBe('El impuesto debe ser un número entre 0 y 100, con máximo 2 decimales')
    expect(products.setTaxRateByFilters).not.toHaveBeenCalled()
  })

  it('una categoría que no existe se rechaza', async () => {
    const { products, service } = setup()
    products.categoryExists.mockResolvedValue(false)
    const result = await service.setTaxRateInBulk('u1', ORG_ID, request({ filters: { status: 'active', categoryId: CATEGORY_ID } }))
    expect(result.error).toBe('La categoría no existe')
    expect(products.setTaxRateByFilters).not.toHaveBeenCalled()
  })

  it('si la lista cambió desde que la confirmó, no cambia nada y lo explica', async () => {
    const { products, service } = setup()
    products.setTaxRateByFilters.mockResolvedValue({ status: 'changed', count: 5 })
    expect(await service.setTaxRateInBulk('u1', ORG_ID, request())).toEqual({
      error: 'La lista cambió: ahora tiene 5 productos y habías confirmado 3. Revísala y vuelve a intentarlo',
      success: '',
    })
    products.setTaxRateByFilters.mockResolvedValue({ status: 'changed', count: 1 })
    expect((await service.setTaxRateInBulk('u1', ORG_ID, request())).error).toContain('ahora tiene 1 producto y')
  })

  it.each([
    ['0', 3, 'Impuesto actualizado: 3 productos quedaron exentos'],
    ['0', 1, 'Impuesto actualizado: 1 producto quedó exento'],
    ['', 3, 'Impuesto actualizado: 3 productos usan la tasa de la empresa'],
    ['', 1, 'Impuesto actualizado: 1 producto usa la tasa de la empresa'],
    ['10', 1, 'Impuesto actualizado: 1 producto tiene 10 % de impuesto'],
    ['5,5', 2, 'Impuesto actualizado: 2 productos tienen 5.5 % de impuesto'],
  ])('mensaje de éxito para "%s" con %i producto(s)', async (taxRate, count, message) => {
    const { products, service } = setup()
    products.setTaxRateByFilters.mockResolvedValue({ status: 'updated', count })
    expect(await service.setTaxRateInBulk('u1', ORG_ID, request({ taxRate }))).toEqual({ error: '', success: message })
  })
})
