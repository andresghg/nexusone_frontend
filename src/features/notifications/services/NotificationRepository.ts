import 'server-only'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { invoices } from '@/db/schema'

export type DueRow = {
  overdueDocuments: number
  overdueAmount: number
  dueSoonDocuments: number
  dueSoonAmount: number
  nextDueDate: string | null // el vencimiento más cercano entre los "por vencer"
}

export interface INotificationRepository {
  /** Documentos emitidos con saldo: ya vencidos (antes de `today`) y por vencer (de `today` a `soonUntil`, ambos incluidos). */
  dueSummary(organizationId: string, today: string, soonUntil: string): Promise<DueRow>
}

const num = (value: string | number | null | undefined) => Number(value ?? 0)

export class NotificationRepository implements INotificationRepository {
  async dueSummary(organizationId: string, today: string, soonUntil: string): Promise<DueRow> {
    // Misma definición de "vencida" que el filtro de la lista de facturación: emitida, no es nota de crédito,
    // sin cobrar o con cobro parcial y con vencimiento anterior a hoy. Así el número de la campana coincide con la lista.
    const balance = sql`(${invoices.total} - ${invoices.creditTotal} - ${invoices.paidTotal})`
    const isOverdue = sql`${invoices.dueDate} < ${today}::date`
    const isSoon = sql`(${invoices.dueDate} >= ${today}::date and ${invoices.dueDate} <= ${soonUntil}::date)`

    const [row] = await db
      .select({
        overdueDocuments: sql<string>`count(*) filter (where ${isOverdue})`,
        overdueAmount: sql<string>`coalesce(sum(${balance}) filter (where ${isOverdue}), 0)`,
        dueSoonDocuments: sql<string>`count(*) filter (where ${isSoon})`,
        dueSoonAmount: sql<string>`coalesce(sum(${balance}) filter (where ${isSoon}), 0)`,
        nextDueDate: sql<string | null>`(min(${invoices.dueDate}) filter (where ${isSoon}))::text`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.status, 'issued'),
          ne(invoices.documentType, 'credit_note'),
          inArray(invoices.paymentStatus, ['unpaid', 'partial']),
          sql`${invoices.dueDate} is not null`,
          sql`${invoices.dueDate} <= ${soonUntil}::date`,
        ),
      )

    return {
      overdueDocuments: num(row?.overdueDocuments),
      overdueAmount: num(row?.overdueAmount),
      dueSoonDocuments: num(row?.dueSoonDocuments),
      dueSoonAmount: num(row?.dueSoonAmount),
      nextDueDate: row?.nextDueDate ?? null,
    }
  }
}

export const notificationRepository = new NotificationRepository()
