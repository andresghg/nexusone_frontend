import { and, asc, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { productCategories, products, stockMovements } from '@/db/schema'
import type { ProductRow, ProductStatus } from '../types/inventory'

// Los numeric de Postgres viajan como texto para no perder precisión.
export type ProductData = {
  categoryId: string | null
  sku: string
  barcode: string | null
  name: string
  description: string | null
  unit: string
  price: string
  cost: string
  minStock: string
  trackStock: boolean
  active: boolean
}

// Stock inicial opcional: se registra como una entrada en la misma transacción que el producto.
export type InitialStock = { quantity: string; userId: string }

export type ProductFilters = {
  search?: string
  categoryId?: string
  status?: ProductStatus // por defecto 'active'
  lowStock?: boolean // solo productos que controlan stock con stock <= mínimo
}

export type Pagination = { page: number; pageSize: number }
export type ProductPage = { rows: ProductRow[]; total: number }

// Regla del módulo: `organizationId` es SIEMPRE el primer parámetro y filtra toda consulta.
export interface IProductRepository {
  findAll(organizationId: string, filters?: ProductFilters): Promise<ProductRow[]>
  findPage(organizationId: string, filters: ProductFilters, pagination: Pagination): Promise<ProductPage>
  findById(organizationId: string, productId: string): Promise<ProductRow | undefined>
  categoryExists(organizationId: string, categoryId: string): Promise<boolean>
  create(organizationId: string, data: ProductData, initial?: InitialStock): Promise<{ id: string }>
  update(organizationId: string, productId: string, data: ProductData): Promise<boolean>
  setActive(organizationId: string, productId: string, active: boolean): Promise<boolean>
}

// Escapa los comodines de LIKE para que "50%" busque literalmente "50%".
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

class ProductRepository implements IProductRepository {
  // Piezas comunes de las consultas: el stock de la empresa (suma de movimientos) y el WHERE.
  private base(organizationId: string, filters: ProductFilters, extra: SQL[] = []) {
    const stock = db.$with('stock').as(
      db
        .select({
          productId: stockMovements.productId,
          total: sql<string>`sum(${stockMovements.delta})`.as('total'),
        })
        .from(stockMovements)
        .where(eq(stockMovements.organizationId, organizationId))
        .groupBy(stockMovements.productId),
    )
    const stockTotal = sql<string>`coalesce(${stock.total}, 0)`

    const conditions: SQL[] = [eq(products.organizationId, organizationId), ...extra]

    const status = filters.status ?? 'active'
    if (status === 'active') conditions.push(eq(products.active, true))
    if (status === 'archived') conditions.push(eq(products.active, false))

    if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId))

    const search = filters.search?.trim()
    if (search) {
      const term = `%${escapeLike(search)}%`
      conditions.push(
        or(ilike(products.name, term), ilike(products.sku, term), ilike(products.barcode, term))!,
      )
    }

    if (filters.lowStock) {
      conditions.push(eq(products.trackStock, true), sql`${stockTotal} <= ${products.minStock}`)
    }

    return { stock, stockTotal, where: and(...conditions) }
  }

  private query(
    organizationId: string,
    filters: ProductFilters,
    extra: SQL[] = [],
    pagination?: Pagination,
  ) {
    const { stock, stockTotal, where } = this.base(organizationId, filters, extra)

    const query = db
      .with(stock)
      .select({
        id: products.id,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
        sku: products.sku,
        barcode: products.barcode,
        name: products.name,
        description: products.description,
        unit: products.unit,
        price: products.price,
        cost: products.cost,
        minStock: products.minStock,
        trackStock: products.trackStock,
        active: products.active,
        createdAt: products.createdAt,
        stock: stockTotal,
      })
      .from(products)
      .leftJoin(
        productCategories,
        and(
          eq(productCategories.organizationId, products.organizationId),
          eq(productCategories.id, products.categoryId),
        ),
      )
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(where)
      .orderBy(asc(products.name), asc(products.id)) // el id desempata: la paginación no repite ni salta filas
      .$dynamic()

    return pagination
      ? query.limit(pagination.pageSize).offset((pagination.page - 1) * pagination.pageSize)
      : query
  }

  private async rows(
    organizationId: string,
    filters: ProductFilters,
    extra: SQL[] = [],
    pagination?: Pagination,
  ) {
    const rows = await this.query(organizationId, filters, extra, pagination)
    return rows.map((r): ProductRow => ({
      ...r,
      price: Number(r.price),
      cost: Number(r.cost),
      minStock: Number(r.minStock),
      stock: Number(r.stock),
      createdAt: r.createdAt.toISOString(),
    }))
  }

  findAll(organizationId: string, filters: ProductFilters = {}) {
    return this.rows(organizationId, filters)
  }

  async findPage(organizationId: string, filters: ProductFilters, pagination: Pagination) {
    const { stock, where } = this.base(organizationId, filters)

    const [rows, [{ total }]] = await Promise.all([
      this.rows(organizationId, filters, [], pagination),
      db
        .with(stock)
        .select({ total: count() })
        .from(products)
        .leftJoin(stock, eq(stock.productId, products.id))
        .where(where),
    ])
    return { rows, total }
  }

  async findById(organizationId: string, productId: string) {
    const [row] = await this.rows(organizationId, { status: 'all' }, [eq(products.id, productId)])
    return row
  }

  async categoryExists(organizationId: string, categoryId: string) {
    const [row] = await db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(and(
        eq(productCategories.organizationId, organizationId),
        eq(productCategories.id, categoryId),
      ))
      .limit(1)
    return !!row
  }

  async create(organizationId: string, data: ProductData, initial?: InitialStock) {
    // Producto y stock inicial juntos: o se guardan los dos o ninguno
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({ organizationId, ...data })
        .returning({ id: products.id })

      if (initial) {
        await tx.insert(stockMovements).values({
          organizationId,
          productId: row.id,
          type: 'in',
          delta: initial.quantity,
          reason: 'Stock inicial',
          createdBy: initial.userId,
        })
      }
      return row
    })
  }

  async update(organizationId: string, productId: string, data: ProductData) {
    const rows = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(products.organizationId, organizationId), eq(products.id, productId)))
      .returning({ id: products.id })
    return rows.length > 0
  }

  async setActive(organizationId: string, productId: string, active: boolean) {
    const rows = await db
      .update(products)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(products.organizationId, organizationId), eq(products.id, productId)))
      .returning({ id: products.id })
    return rows.length > 0
  }
}

export const productRepository = new ProductRepository()
