import type { InvoiceListRow } from '../types/invoice'

export type StatusBadge = {
  label: string
  variant: 'secondary' | 'destructive' | 'outline'
}

type BadgeInput = Pick<InvoiceListRow, 'status' | 'paymentStatus' | 'overdue'> &
  Partial<Pick<InvoiceListRow, 'documentType' | 'creditTotal' | 'total'>>

/** Cómo se ve el estado de un documento en la lista: una sola insignia, la más importante. */
export function invoiceBadge(row: BadgeInput): StatusBadge {
  if (row.status === 'void') return { label: 'Anulada', variant: 'destructive' }
  // Una nota de crédito no se cobra: no es "pagada" ni "pendiente", simplemente está emitida
  if (row.documentType === 'credit_note') return { label: 'Emitida', variant: 'secondary' }
  if (row.overdue) return { label: 'Vencida', variant: 'destructive' }
  // Acreditada por completo: no queda nada que cobrar ni que devolver por línea
  if (row.total !== undefined && row.total > 0 && (row.creditTotal ?? 0) >= row.total) {
    return { label: 'Acreditada', variant: 'secondary' }
  }
  switch (row.paymentStatus) {
    case 'paid':
      return { label: 'Pagada', variant: 'secondary' }
    case 'partial':
      return { label: 'Pago parcial', variant: 'outline' }
    default:
      return { label: 'Pendiente', variant: 'outline' }
  }
}
