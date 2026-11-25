import { isForeignKeyViolation, isUniqueViolation } from '@/db/pg-errors'
import {
  accessService,
  type IAccessResolver,
} from '@/features/organization/services/AccessService'
import type { BulkTaxRateInput, ProductInput } from '../schemas/inventorySchema'
import { fromMilli, toMilli } from '../utils/stockMath'
import {
  productRepository,
  type IProductRepository,
  type Pagination,
  type ProductData,
  type ProductFilters,
} from './ProductRepository'

const fail = (error: string) => ({ error, success: '' })

export const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

// La página viene de la URL: se normaliza para que nadie pida 10 millones de filas o la página NaN.
const toInt = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.floor(value as number) : fallback

const NO_WRITE = 'No tienes permisos para modificar el inventario'

// Normaliza lo que viene del formulario: SKU en mayúsculas, vacíos a null,
// y números como texto con los decimales de la base de datos.
// Impuesto propio: vacío = usa la tasa de la empresa (null); "0" = exento; otro valor = esa tasa.
// El schema de la acción ya lo validó; aquí se vuelve a comprobar para que un valor raro nunca se
// guarde como exento por accidente.
function toTaxRate(text: string): string | null {
  const value = text.trim()
  if (value === '') return null
  const rate = Number(value.replace(',', '.'))
  if (!/^\d+([.,]\d{1,2})?$/.test(value) || !Number.isFinite(rate) || rate > 100) {
    throw new RangeError('Impuesto inválido')
  }
  return rate.toFixed(2)
}

const toData = (d: ProductInput): ProductData => ({
  categoryId: d.categoryId || null,
  sku: d.sku.trim().toUpperCase(),
  barcode: d.barcode.trim() || null,
  name: d.name.trim(),
  description: d.description.trim() || null,
  unit: d.unit,
  price: d.price.toFixed(2),
  cost: d.cost.toFixed(2),
  taxRate: toTaxRate(d.taxRate),
  minStock: d.minStock.toFixed(3),
  trackStock: d.trackStock,
  active: d.active,
})

// Errores esperables de la base de datos → mensaje para el usuario. Otros se relanzan.
function friendlyError(error: unknown) {
  if (isUniqueViolation(error, 'sku')) return 'Ya existe un producto con ese SKU'
  if (isUniqueViolation(error, 'barcode')) return 'Ya existe un producto con ese código de barras'
  if (isForeignKeyViolation(error)) return 'La categoría no existe'
  return null
}

export class ProductService {
  constructor(
    private products: IProductRepository,
    private access: IAccessResolver,
  ) {}

  async list(
    userId: string,
    organizationId: string,
    filters: ProductFilters = {},
    pagination: Partial<Pagination> = {},
  ) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.read')
    if (!access) return { rows: [], total: 0 }

    return this.products.findPage(access.organizationId, filters, {
      page: Math.max(1, toInt(pagination.page, 1)),
      pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(pagination.pageSize, DEFAULT_PAGE_SIZE))),
    })
  }

  // `initialStock` > 0 registra una entrada "Stock inicial" junto con el producto.
  async create(userId: string, organizationId: string, input: ProductInput, initialStock = 0) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.write')
    if (!access) return fail(NO_WRITE)

    const data = toData(input)
    if (data.categoryId && !(await this.products.categoryExists(access.organizationId, data.categoryId))) {
      return fail('La categoría no existe')
    }

    // Un producto que no controla stock no tiene movimientos
    const initial =
      data.trackStock && initialStock > 0
        ? { quantity: fromMilli(toMilli(initialStock)), userId }
        : undefined

    try {
      await (initial
        ? this.products.create(access.organizationId, data, initial)
        : this.products.create(access.organizationId, data))
    } catch (error) {
      const message = friendlyError(error)
      if (message) return fail(message)
      throw error
    }
    return { error: '', success: 'Producto creado' }
  }

  async update(userId: string, organizationId: string, productId: string, input: ProductInput) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.write')
    if (!access) return fail(NO_WRITE)

    const data = toData(input)
    if (data.categoryId && !(await this.products.categoryExists(access.organizationId, data.categoryId))) {
      return fail('La categoría no existe')
    }

    try {
      const updated = await this.products.update(access.organizationId, productId, data)
      if (!updated) return fail('El producto no existe')
    } catch (error) {
      const message = friendlyError(error)
      if (message) return fail(message)
      throw error
    }
    return { error: '', success: 'Producto actualizado' }
  }

  // Los productos no se borran: se archivan, para conservar el historial de movimientos.
  async setActive(userId: string, organizationId: string, productId: string, active: boolean) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.write')
    if (!access) return fail(NO_WRITE)

    const updated = await this.products.setActive(access.organizationId, productId, active)
    if (!updated) return fail('El producto no existe')
    return { error: '', success: active ? 'Producto restaurado' : 'Producto archivado' }
  }

  /**
   * Cambia el impuesto de todos los productos de la lista que la persona está viendo. Vacío = tasa de la
   * empresa, "0" = exento, otro valor = esa tasa. Si la lista ya no tiene el total que confirmó, no cambia nada.
   */
  async setTaxRateInBulk(userId: string, organizationId: string, input: Omit<BulkTaxRateInput, 'organizationId'>) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.write')
    if (!access) return fail(NO_WRITE)

    let taxRate: string | null
    try {
      taxRate = toTaxRate(input.taxRate)
    } catch {
      return fail('El impuesto debe ser un número entre 0 y 100, con máximo 2 decimales')
    }

    const filters = {
      search: input.filters.search?.trim() || undefined,
      categoryId: input.filters.categoryId,
      status: input.filters.status,
      lowStock: input.filters.lowStock || undefined,
    }
    if (filters.categoryId && !(await this.products.categoryExists(access.organizationId, filters.categoryId))) {
      return fail('La categoría no existe')
    }

    const result = await this.products.setTaxRateByFilters(access.organizationId, filters, taxRate, input.expectedCount)
    if (result.status === 'changed') {
      return fail(
        `La lista cambió: ahora tiene ${result.count} producto${result.count === 1 ? '' : 's'} y habías confirmado ${input.expectedCount}. Revísala y vuelve a intentarlo`,
      )
    }

    const one = result.count === 1
    const noun = one ? 'producto' : 'productos'
    const effect =
      taxRate === null
        ? `${one ? 'usa' : 'usan'} la tasa de la empresa`
        : Number(taxRate) === 0
          ? one
            ? 'quedó exento'
            : 'quedaron exentos'
          : `${one ? 'tiene' : 'tienen'} ${Number(taxRate)} % de impuesto`
    return { error: '', success: `Impuesto actualizado: ${result.count} ${noun} ${effect}` }
  }

  async getLowStockCount(userId: string, organizationId: string): Promise<number> {
  const access = await this.access.authorize(
    userId,
    organizationId,
    'pos.inventario.read',
  )

  if (!access) return 0

  return this.products.getLowStockCount(access.organizationId)
}
}

export const productService = new ProductService(productRepository, accessService)
