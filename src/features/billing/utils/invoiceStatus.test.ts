import { describe, expect, it } from 'vitest'
import { invoiceBadge } from './invoiceStatus'

const row = (over = {}) => ({ status: 'issued' as const, paymentStatus: 'unpaid' as const, overdue: false, ...over })

describe('invoiceBadge', () => {
  it('un documento anulado se marca como anulado, sin importar su cobro', () => {
    expect(invoiceBadge(row({ status: 'void', paymentStatus: 'paid' }))).toEqual({ label: 'Anulada', variant: 'destructive' })
    expect(invoiceBadge(row({ status: 'void', overdue: true }))).toEqual({ label: 'Anulada', variant: 'destructive' })
  })

  it('un documento vencido se destaca', () => {
    expect(invoiceBadge(row({ overdue: true }))).toEqual({ label: 'Vencida', variant: 'destructive' })
    expect(invoiceBadge(row({ paymentStatus: 'partial', overdue: true }))).toEqual({ label: 'Vencida', variant: 'destructive' })
  })

  it('según el estado de cobro', () => {
    expect(invoiceBadge(row({ paymentStatus: 'paid' }))).toEqual({ label: 'Pagada', variant: 'secondary' })
    expect(invoiceBadge(row({ paymentStatus: 'partial' }))).toEqual({ label: 'Pago parcial', variant: 'outline' })
    expect(invoiceBadge(row({ paymentStatus: 'unpaid' }))).toEqual({ label: 'Pendiente', variant: 'outline' })
  })
})
