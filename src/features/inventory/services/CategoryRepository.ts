import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { productCategories, products } from '@/db/schema'
import type { CategoryRow } from '../types/inventory'

export interface ICategoryRepository {
  findAll(organizationId: string): Promise<CategoryRow[]>
  create(organizationId: string, name: string): Promise<{ id: string }>
  rename(organizationId: string, categoryId: string, name: string): Promise<boolean>
  remove(organizationId: string, categoryId: string): Promise<boolean>
}

class CategoryRepository implements ICategoryRepository {
  async findAll(organizationId: string) {
    return db
      .select({
        id: productCategories.id,
        name: productCategories.name,
        productCount: sql<number>`count(${products.id})::int`,
      })
      .from(productCategories)
      .leftJoin(
        products,
        and(
          eq(products.organizationId, productCategories.organizationId),
          eq(products.categoryId, productCategories.id),
        ),
      )
      .where(eq(productCategories.organizationId, organizationId))
      .groupBy(productCategories.id, productCategories.name)
      .orderBy(asc(productCategories.name))
  }

  async create(organizationId: string, name: string) {
    const [row] = await db
      .insert(productCategories)
      .values({ organizationId, name })
      .returning({ id: productCategories.id })
    return row
  }

  async rename(organizationId: string, categoryId: string, name: string) {
    const rows = await db
      .update(productCategories)
      .set({ name })
      .where(and(
        eq(productCategories.organizationId, organizationId),
        eq(productCategories.id, categoryId),
      ))
      .returning({ id: productCategories.id })
    return rows.length > 0
  }

  async remove(organizationId: string, categoryId: string) {
    const rows = await db
      .delete(productCategories)
      .where(and(
        eq(productCategories.organizationId, organizationId),
        eq(productCategories.id, categoryId),
      ))
      .returning({ id: productCategories.id })
    return rows.length > 0
  }
}

export const categoryRepository = new CategoryRepository()
