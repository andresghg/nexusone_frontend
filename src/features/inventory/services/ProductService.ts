import { isForeignKeyViolation, isUniqueViolation } from '@/db/pg-errors'
import {
  accessService,
  type IAccessResolver,
} from '@/features/organization/services/AccessService'
import type { ProductInput } from '../schemas/inventorySchema'
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
const toData = (d: ProductInput): ProductData => ({
  categoryId: d.categoryId || null,
  sku: d.sku.trim().toUpperCase(),
  barcode: d.barcode.trim() || null,
  name: d.name.trim(),
  description: d.description.trim() || null,
  unit: d.unit,
  price: d.price.toFixed(2),
  cost: d.cost.toFixed(2),
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
}

export const productService = new ProductService(productRepository, accessService)
