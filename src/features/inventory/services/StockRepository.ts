import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { products, profiles, stockMovements } from '@/db/schema'
import {
  HISTORY_LIMIT,
  type MovementPlan,
  type MovementRow,
  type MovementType,
  type StockState,
} from '../types/inventory'
import { milliToNumber, toMilli } from '../utils/stockMath'

export type { MovementPlan, StockState }

export type RecordResult =
  | { status: 'not_found' }
  | { status: 'rejected'; error: string }
  | { status: 'recorded'; stock: number }

// Regla del módulo: `organizationId` es SIEMPRE el primer parámetro y filtra toda consulta.
export interface IStockRepository {
  /**
   * Registra un movimiento de forma atómica: bloquea el producto, lee su stock actual,
   * deja que `decide` (la regla de negocio) acepte o rechace, e inserta el movimiento.
   * Dos salidas simultáneas del mismo producto se ejecutan una detrás de otra.
   */
  record(
    organizationId: string,
    productId: string,
    userId: string,
    decide: (state: StockState) => MovementPlan,
  ): Promise<RecordResult>

  history(organizationId: string, productId: string, limit?: number): Promise<MovementRow[]>
}

class StockRepository implements IStockRepository {
  async record(
    organizationId: string,
    productId: string,
    userId: string,
    decide: (state: StockState) => MovementPlan,
  ): Promise<RecordResult> {
    return db.transaction(async (tx): Promise<RecordResult> => {
      // FOR UPDATE: nadie más puede mover este producto hasta que termine la transacción
      const [product] = await tx
        .select({ trackStock: products.trackStock, active: products.active })
        .from(products)
        .where(and(eq(products.organizationId, organizationId), eq(products.id, productId)))
        .for('update')
      if (!product) return { status: 'not_found' }

      const [{ total }] = await tx
        .select({ total: sql<string>`coalesce(sum(${stockMovements.delta}), 0)` })
        .from(stockMovements)
        .where(and(
          eq(stockMovements.organizationId, organizationId),
          eq(stockMovements.productId, productId),
        ))

      const plan = decide({
        stock: Number(total),
        trackStock: product.trackStock,
        active: product.active,
      })
      if (!plan.ok) return { status: 'rejected', error: plan.error }

      await tx.insert(stockMovements).values({
        organizationId,
        productId,
        type: plan.type,
        delta: plan.delta,
        reason: plan.reason,
        createdBy: userId,
      })

      return {
        status: 'recorded',
        stock: milliToNumber(toMilli(total) + toMilli(plan.delta)),
      }
    })
  }

  async history(organizationId: string, productId: string, limit = HISTORY_LIMIT) {
    const rows = await db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        delta: stockMovements.delta,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
        userName: profiles.fullName,
      })
      .from(stockMovements)
      .leftJoin(profiles, eq(profiles.id, stockMovements.createdBy))
      .where(and(
        eq(stockMovements.organizationId, organizationId),
        eq(stockMovements.productId, productId),
      ))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(limit)

    return rows.map((r): MovementRow => ({
      id: r.id,
      type: r.type as MovementType,
      delta: Number(r.delta),
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      userName: r.userName,
    }))
  }
}

export const stockRepository = new StockRepository()
