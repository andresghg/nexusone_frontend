import type { InvoiceListRow } from '../types/invoice'

export type StatusBadge = {
  label: string
  variant: 'secondary' | 'destructive' | 'outline'
}

/** Cómo se ve el estado de un documento en la lista: una sola insignia, la más importante. */
export function invoiceBadge(row: Pick<InvoiceListRow, 'status' | 'paymentStatus' | 'overdue'>): StatusBadge {
  if (row.status === 'void') return { label: 'Anulada', variant: 'destructive' }
  if (row.overdue) return { label: 'Vencida', variant: 'destructive' }
  switch (row.paymentStatus) {
    case 'paid':
      return { label: 'Pagada', variant: 'secondary' }
    case 'partial':
      return { label: 'Pago parcial', variant: 'outline' }
    default:
      return { label: 'Pendiente', variant: 'outline' }
  }
}
