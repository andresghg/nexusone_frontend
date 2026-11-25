import type { DisplayFormat } from '@/features/billing/types/billing'

// Reportes de ventas, productos y cuentas por cobrar. Todos los montos están en la moneda de la empresa
// (unidades mayores: pesos, dólares) y todas las fechas son de calendario en la zona horaria de la empresa.

export type Granularity = 'day' | 'month'

/** Rango de fechas de calendario YYYY-MM-DD, ambas inclusive, en la zona horaria de la empresa. */
export type DateRange = { from: string; to: string }

/** Lo que devuelve la base por período: solo sumas, sin interpretar. */
export type SalesBucketRow = {
  bucket: string // 'YYYY-MM-DD' (día) o 'YYYY-MM' (mes)
  documents: number // facturas, recibos y notas de venta emitidas (anuladas no cuentan)
  invoicedTotal: number // con impuesto
  invoicedSubtotal: number // sin impuesto
  creditNotes: number // notas de crédito emitidas
  creditedTotal: number
  creditedSubtotal: number
}

/** Un período del gráfico: lo facturado, lo acreditado y lo que queda (ventas netas). */
export type SalesPoint = SalesBucketRow & {
  netTotal: number // facturado − acreditado, con impuesto (puede ser negativo si se acredita más de lo que se vendió ese día)
  netSubtotal: number // lo mismo, sin impuesto
}

export type SalesTotals = {
  documents: number
  creditNotes: number
  invoicedTotal: number
  invoicedSubtotal: number
  creditedTotal: number
  creditedSubtotal: number
  netTotal: number
  netSubtotal: number
  netTax: number // impuesto neto: netTotal − netSubtotal
  averageTicket: number // facturado / documentos (antes de notas de crédito); 0 si no hubo documentos
  collected: number // cobros registrados en el período (vigentes), por fecha de cobro
}

export type SalesReport = {
  range: DateRange
  granularity: Granularity
  display: DisplayFormat
  points: SalesPoint[] // un punto por día o mes del rango, también los de cero ventas
  totals: SalesTotals
}

export type ProductRank = 'revenue' | 'quantity'

export type TopProduct = {
  productId: string | null // null: concepto libre (sin producto)
  sku: string | null
  description: string
  unit: string
  quantity: number // vendido − acreditado
  total: number // con impuesto, vendido − acreditado
  net: number // sin impuesto, vendido − acreditado
}

export type TopProductsReport = {
  range: DateRange
  rank: ProductRank
  display: DisplayFormat
  products: TopProduct[]
}

export const AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'Al día',
  d1_30: '1 a 30 días de atraso',
  d31_60: '31 a 60 días',
  d61_90: '61 a 90 días',
  d90_plus: 'Más de 90 días',
}

export type AgingRow = { bucket: AgingBucket; documents: number; amount: number }

export type Debtor = {
  customerId: string | null
  name: string // "Consumidor final" si el documento no tiene cliente
  documents: number
  amount: number
  oldestDueDate: string | null
}

export type ReceivablesReport = {
  asOf: string // la fecha (de calendario, zona de la empresa) con que se calculó el atraso
  display: DisplayFormat
  documents: number
  total: number // por cobrar: total − acreditado − cobrado, solo documentos con saldo
  overdueDocuments: number
  overdue: number // lo que ya venció (fecha de vencimiento anterior a hoy)
  aging: AgingRow[] // siempre los 5 tramos, también los vacíos
  debtors: Debtor[] // los que más deben, de mayor a menor
}

export type DashboardSummary = {
  display: DisplayFormat
  asOf: string // el "hoy" de la empresa (YYYY-MM-DD) con que se calcularon las cifras
  today: { netTotal: number; documents: number }
  yesterday: { netTotal: number }
  week: { documents: number } // los últimos 7 días contando hoy
  month: { netTotal: number; documents: number; averageTicket: number } // del día 1 a hoy
  receivables: { total: number; overdue: number }
}
