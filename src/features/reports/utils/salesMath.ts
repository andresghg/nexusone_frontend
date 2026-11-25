import { fromMinorUnits, toMinorUnits } from '@/features/billing/utils/minorUnits'
import type { SalesBucketRow, SalesPoint, SalesTotals } from '../types/report'

// Aritmética de los reportes de ventas en unidades mínimas enteras (pesos, centavos), sin coma flotante.

/** Monto de la base → unidades mínimas. Los montos de la base nunca son negativos ni tienen decimales de más. */
export const minor = (amount: number, decimals: number) => toMinorUnits(amount, decimals) ?? 0

const empty = (bucket: string): SalesBucketRow => ({
  bucket,
  documents: 0,
  invoicedTotal: 0,
  invoicedSubtotal: 0,
  creditNotes: 0,
  creditedTotal: 0,
  creditedSubtotal: 0,
})

/** Une lo que devolvió la base con la lista completa de períodos: los que no tuvieron ventas quedan en cero. */
export function fillBuckets(rows: SalesBucketRow[], buckets: string[], decimals: number): SalesPoint[] {
  const byBucket = new Map(rows.map((row) => [row.bucket, row]))
  return buckets.map((bucket) => {
    const row = byBucket.get(bucket) ?? empty(bucket)
    return {
      ...row,
      netTotal: fromMinorUnits(minor(row.invoicedTotal, decimals) - minor(row.creditedTotal, decimals), decimals),
      netSubtotal: fromMinorUnits(minor(row.invoicedSubtotal, decimals) - minor(row.creditedSubtotal, decimals), decimals),
    }
  })
}

export function summarize(points: SalesPoint[], collected: number, decimals: number): SalesTotals {
  const sum = (pick: (point: SalesPoint) => number) =>
    points.reduce((acc, point) => acc + minor(pick(point), decimals), 0)

  const documents = points.reduce((acc, point) => acc + point.documents, 0)
  const creditNotes = points.reduce((acc, point) => acc + point.creditNotes, 0)
  const invoiced = sum((p) => p.invoicedTotal)
  const invoicedSub = sum((p) => p.invoicedSubtotal)
  const credited = sum((p) => p.creditedTotal)
  const creditedSub = sum((p) => p.creditedSubtotal)
  const net = invoiced - credited
  const netSub = invoicedSub - creditedSub

  return {
    documents,
    creditNotes,
    invoicedTotal: fromMinorUnits(invoiced, decimals),
    invoicedSubtotal: fromMinorUnits(invoicedSub, decimals),
    creditedTotal: fromMinorUnits(credited, decimals),
    creditedSubtotal: fromMinorUnits(creditedSub, decimals),
    netTotal: fromMinorUnits(net, decimals),
    netSubtotal: fromMinorUnits(netSub, decimals),
    netTax: fromMinorUnits(net - netSub, decimals),
    // Ticket promedio: lo facturado entre los documentos emitidos, antes de notas de crédito
    averageTicket: documents === 0 ? 0 : fromMinorUnits(Math.round(invoiced / documents), decimals),
    collected,
  }
}
