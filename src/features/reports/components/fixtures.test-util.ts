import { DEFAULT_DISPLAY_FORMAT } from '@/features/billing/types/billing'
import type { ReceivablesReport, SalesPoint, SalesReport, TopProductsReport } from '../types/report'

// Datos de ejemplo para las pruebas de las pantallas de reportes (no es un test: no tiene sufijo .test)
export const display = DEFAULT_DISPLAY_FORMAT

const point = (over: Partial<SalesPoint> & { bucket: string }): SalesPoint => ({
  documents: 0, invoicedTotal: 0, invoicedSubtotal: 0, creditNotes: 0, creditedTotal: 0, creditedSubtotal: 0, netTotal: 0, netSubtotal: 0, ...over,
})

export const salesReport = (over: Partial<SalesReport> = {}): SalesReport => ({
  range: { from: '2026-11-20', to: '2026-11-23' },
  granularity: 'day',
  display,
  points: [
    point({ bucket: '2026-11-20', documents: 2, invoicedTotal: 3570, invoicedSubtotal: 3000, netTotal: 3570, netSubtotal: 3000 }),
    point({ bucket: '2026-11-21' }), // sin ventas: no sale en la tabla
    point({ bucket: '2026-11-22', creditNotes: 1, creditedTotal: 1190, creditedSubtotal: 1000, netTotal: -1190, netSubtotal: -1000 }),
    point({ bucket: '2026-11-23', documents: 1, invoicedTotal: 1190, invoicedSubtotal: 1000, netTotal: 1190, netSubtotal: 1000 }),
  ],
  totals: {
    documents: 3, creditNotes: 1, invoicedTotal: 4760, invoicedSubtotal: 4000, creditedTotal: 1190, creditedSubtotal: 1000,
    netTotal: 3570, netSubtotal: 3000, netTax: 570, averageTicket: 1587, collected: 2380,
  },
  ...over,
})

export const emptySales = (): SalesReport =>
  salesReport({
    points: [point({ bucket: '2026-11-20' }), point({ bucket: '2026-11-21' })],
    totals: { documents: 0, creditNotes: 0, invoicedTotal: 0, invoicedSubtotal: 0, creditedTotal: 0, creditedSubtotal: 0, netTotal: 0, netSubtotal: 0, netTax: 0, averageTicket: 0, collected: 0 },
  })

export const productsReport = (over: Partial<TopProductsReport> = {}): TopProductsReport => ({
  range: { from: '2026-11-01', to: '2026-11-23' },
  rank: 'revenue',
  display,
  products: [
    { productId: 'p1', sku: 'COLA', description: 'Cola 1L', unit: 'un', quantity: 4, total: 4760, net: 4000 },
    { productId: 'p2', sku: 'AGUA', description: 'Agua 500ml', unit: 'un', quantity: 10, total: 4000, net: 3361 },
    { productId: null, sku: null, description: 'Flete', unit: 'un', quantity: 1.5, total: 2000, net: 1681 },
  ],
  ...over,
})

export const receivablesReport = (over: Partial<ReceivablesReport> = {}): ReceivablesReport => ({
  asOf: '2026-11-23',
  display,
  documents: 5,
  total: 6140,
  overdueDocuments: 4,
  overdue: 4950,
  aging: [
    { bucket: 'current', documents: 1, amount: 1190 },
    { bucket: 'd1_30', documents: 1, amount: 1380 },
    { bucket: 'd31_60', documents: 1, amount: 1190 },
    { bucket: 'd61_90', documents: 0, amount: 0 },
    { bucket: 'd90_plus', documents: 2, amount: 2380 },
  ],
  debtors: [
    { customerId: null, name: 'Consumidor final', documents: 2, amount: 2380, oldestDueDate: '2026-08-15' },
    { customerId: 'c1', name: 'Ana Pérez', documents: 1, amount: 1190, oldestDueDate: '2026-12-10' },
    { customerId: 'c2', name: 'Beto Soto', documents: 1, amount: 1380, oldestDueDate: null },
  ],
  ...over,
})
