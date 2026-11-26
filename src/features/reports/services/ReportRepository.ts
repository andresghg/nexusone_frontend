import 'server-only'
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { invoiceItems, invoicePayments, invoices } from '@/db/schema'
import {
  AGING_BUCKETS,
  type AgingBucket,
  type AgingRow,
  type DateRange,
  type Debtor,
  type Granularity,
  type ProductRank,
  type SalesBucketRow,
  type TopProduct,
} from '../types/report'

export type ReceivablesData = {
  aging: AgingRow[] // siempre los 5 tramos, también los vacíos
  debtors: Debtor[] // los que más deben, de mayor a menor
}

export type PaymentMethodTotals = { method: string; payments: number; amount: number }

export interface IReportRepository {
  /** Facturado y acreditado por día o mes (solo períodos con movimiento). Las anuladas no cuentan. */
  salesBuckets(organizationId: string, range: DateRange, timezone: string, granularity: Granularity): Promise<SalesBucketRow[]>
  /** Cobros vigentes (no anulados) con fecha de cobro dentro del rango. */
  collected(organizationId: string, range: DateRange, timezone: string): Promise<number>
  /** Cobros vigentes (no anulados) con fecha de cobro dentro del rango, por forma de pago. Solo las que tienen cobros. */
  paymentsByMethod(organizationId: string, range: DateRange, timezone: string): Promise<PaymentMethodTotals[]>
  /** Productos vendidos en el rango, netos de notas de crédito, ya ordenados. */
  topProducts(
    organizationId: string,
    range: DateRange,
    timezone: string,
    rank: ProductRank,
    limit: number,
  ): Promise<TopProduct[]>
  /** Documentos emitidos con saldo pendiente al día `today` (YYYY-MM-DD de la empresa). */
  receivables(organizationId: string, today: string, debtorLimit: number): Promise<ReceivablesData>
}

// Fecha de calendario de la empresa de un instante guardado en UTC
const localDate = (tz: string, column: unknown) => sql`(timezone(${tz}, ${column}))::date`
const inRange = (tz: string, column: unknown, range: DateRange) =>
  sql`${localDate(tz, column)} between ${range.from}::date and ${range.to}::date`

const num = (value: string | number | null | undefined) => Number(value ?? 0)

export class ReportRepository implements IReportRepository {
  async paymentsByMethod(organizationId: string, range: DateRange, timezone: string): Promise<PaymentMethodTotals[]> {
    const rows = await db
      .select({
        method: invoicePayments.method,
        payments: sql<string>`count(*)`,
        amount: sql<string>`coalesce(sum(${invoicePayments.amount}), 0)`,
      })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.organizationId, organizationId),
          isNull(invoicePayments.voidedAt),
          inRange(timezone, invoicePayments.paidAt, range),
        ),
      )
      .groupBy(invoicePayments.method)
    return rows.map((row): PaymentMethodTotals => ({ method: row.method, payments: num(row.payments), amount: num(row.amount) }))
  }

  async salesBuckets(organizationId: string, range: DateRange, timezone: string, granularity: Granularity) {
    const isNote = sql`${invoices.documentType} = 'credit_note'`
    const format = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'

    // Se agrupa por posición (1): repetir la expresión con parámetros en SELECT y en GROUP BY no se reconoce como la misma
    const rows = await db
      .select({
        bucket: sql<string>`to_char(timezone(${timezone}, ${invoices.issuedAt}), ${format})`,
        documents: sql<string>`count(*) filter (where not (${isNote}))`,
        invoicedTotal: sql<string>`coalesce(sum(${invoices.total}) filter (where not (${isNote})), 0)`,
        invoicedSubtotal: sql<string>`coalesce(sum(${invoices.subtotal}) filter (where not (${isNote})), 0)`,
        creditNotes: sql<string>`count(*) filter (where ${isNote})`,
        creditedTotal: sql<string>`coalesce(sum(${invoices.total}) filter (where ${isNote}), 0)`,
        creditedSubtotal: sql<string>`coalesce(sum(${invoices.subtotal}) filter (where ${isNote}), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.status, 'issued'),
          inRange(timezone, invoices.issuedAt, range),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`)

    return rows.map(
      (row): SalesBucketRow => ({
        bucket: row.bucket,
        documents: num(row.documents),
        invoicedTotal: num(row.invoicedTotal),
        invoicedSubtotal: num(row.invoicedSubtotal),
        creditNotes: num(row.creditNotes),
        creditedTotal: num(row.creditedTotal),
        creditedSubtotal: num(row.creditedSubtotal),
      }),
    )
  }

  async collected(organizationId: string, range: DateRange, timezone: string) {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${invoicePayments.amount}), 0)` })
      .from(invoicePayments)
      .where(
        and(
          eq(invoicePayments.organizationId, organizationId),
          isNull(invoicePayments.voidedAt),
          inRange(timezone, invoicePayments.paidAt, range),
        ),
      )
    return num(row?.total)
  }

  async topProducts(organizationId: string, range: DateRange, timezone: string, rank: ProductRank, limit: number) {
    // Una nota de crédito resta lo que acredita: cantidad e importes con signo negativo
    const sign = sql`(case when ${invoices.documentType} = 'credit_note' then -1 else 1 end)`
    const key = sql`coalesce(${invoiceItems.productId}::text, 'd:' || ${invoiceItems.description})`
    const quantity = sql`sum(${invoiceItems.quantity} * ${sign})`
    const total = sql`sum(${invoiceItems.lineTotal} * ${sign})`
    const net = sql`sum(${invoiceItems.lineNet} * ${sign})`
    const latest = (column: unknown) => sql`(array_agg(${column} order by ${invoices.issuedAt} desc))[1]`

    const rows = await db
      .select({
        productId: sql<string | null>`max(${invoiceItems.productId}::text)`,
        sku: sql<string | null>`${latest(invoiceItems.sku)}`,
        description: sql<string>`${latest(invoiceItems.description)}`,
        unit: sql<string>`${latest(invoiceItems.unit)}`,
        quantity: sql<string>`${quantity}`,
        total: sql<string>`${total}`,
        net: sql<string>`${net}`,
      })
      .from(invoiceItems)
      .innerJoin(
        invoices,
        and(eq(invoices.organizationId, invoiceItems.organizationId), eq(invoices.id, invoiceItems.invoiceId)),
      )
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.status, 'issued'),
          inRange(timezone, invoices.issuedAt, range),
        ),
      )
      .groupBy(key)
      // Lo que quedó totalmente acreditado (cantidad neta 0) no es "vendido"
      .having(sql`${quantity} > 0`)
      .orderBy(desc(rank === 'quantity' ? quantity : total), asc(sql`3`), asc(key))
      .limit(limit)

    return rows.map(
      (row): TopProduct => ({
        productId: row.productId,
        sku: row.sku,
        description: row.description,
        unit: row.unit,
        quantity: num(row.quantity),
        total: num(row.total),
        net: num(row.net),
      }),
    )
  }

  async receivables(organizationId: string, today: string, debtorLimit: number): Promise<ReceivablesData> {
    // Saldo = total − acreditado − cobrado. Solo documentos emitidos que no son notas de crédito y aún deben algo.
    const balance = sql`(${invoices.total} - ${invoices.creditTotal} - ${invoices.paidTotal})`
    const open = and(
      eq(invoices.organizationId, organizationId),
      eq(invoices.status, 'issued'),
      ne(invoices.documentType, 'credit_note'),
      sql`${balance} > 0`,
    )
    const late = sql`(${today}::date - ${invoices.dueDate})`
    const bucket = sql<string>`case
      when ${invoices.dueDate} is null or ${invoices.dueDate} >= ${today}::date then 'current'
      when ${late} <= 30 then 'd1_30'
      when ${late} <= 60 then 'd31_60'
      when ${late} <= 90 then 'd61_90'
      else 'd90_plus' end`

    const [agingRows, debtorRows] = await Promise.all([
      db
        .select({
          bucket,
          documents: sql<string>`count(*)`,
          amount: sql<string>`sum(${balance})`,
        })
        .from(invoices)
        .where(open)
        .groupBy(sql`1`),
      db
        .select({
          customerId: sql<string | null>`max(${invoices.customerId}::text)`,
          name: sql<string | null>`max(${invoices.customerName})`,
          documents: sql<string>`count(*)`,
          amount: sql<string>`sum(${balance})`,
          oldestDueDate: sql<string | null>`min(${invoices.dueDate})::text`,
        })
        .from(invoices)
        .where(open)
        .groupBy(sql`coalesce(${invoices.customerId}::text, ${invoices.customerName}, '')`)
        .orderBy(desc(sql`sum(${balance})`), asc(sql`min(${invoices.dueDate})`))
        .limit(debtorLimit),
    ])

    const byBucket = new Map(agingRows.map((row) => [row.bucket as AgingBucket, row]))
    const aging = AGING_BUCKETS.map(
      (name): AgingRow => ({
        bucket: name,
        documents: num(byBucket.get(name)?.documents),
        amount: num(byBucket.get(name)?.amount),
      }),
    )

    return {
      aging,
      debtors: debtorRows.map(
        (row): Debtor => ({
          customerId: row.customerId,
          name: row.name ?? '',
          documents: num(row.documents),
          amount: num(row.amount),
          oldestDueDate: row.oldestDueDate,
        }),
      ),
    }
  }
}

export const reportRepository = new ReportRepository()
