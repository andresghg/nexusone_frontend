import type { PaymentStatus } from '../types/billing'

/**
 * Estado de cobro según lo cobrado y el total (ambos en unidades mínimas):
 * nada → unpaid · algo → partial · todo → paid. Un documento de total 0 no tiene nada que cobrar: paid.
 */
export function paymentStatusFor(paidMinor: number, totalMinor: number): PaymentStatus {
  if (paidMinor >= totalMinor) return 'paid'
  if (paidMinor <= 0) return 'unpaid'
  return 'partial'
}
