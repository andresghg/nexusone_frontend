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

describe('invoiceBadge · notas de crédito', () => {
  it('una nota de crédito no se cobra: está emitida, sin importar su estado de cobro', () => {
    for (const paymentStatus of ['unpaid', 'partial', 'paid'] as const) {
      expect(invoiceBadge(row({ documentType: 'credit_note', paymentStatus, overdue: true }))).toEqual({ label: 'Emitida', variant: 'secondary' })
    }
  })
  it('anulada gana a todo', () => {
    expect(invoiceBadge(row({ documentType: 'credit_note', status: 'void' }))).toEqual({ label: 'Anulada', variant: 'destructive' })
  })
  it('un documento acreditado por completo se marca como acreditado', () => {
    expect(invoiceBadge(row({ documentType: 'invoice', total: 2380, creditTotal: 2380, paymentStatus: 'paid' }))).toEqual({ label: 'Acreditada', variant: 'secondary' })
    expect(invoiceBadge(row({ documentType: 'invoice', total: 2380, creditTotal: 2380, paymentStatus: 'unpaid' }))).toEqual({ label: 'Acreditada', variant: 'secondary' })
  })
  it('acreditado en parte conserva su estado de cobro', () => {
    expect(invoiceBadge(row({ total: 2380, creditTotal: 1190, paymentStatus: 'partial' }))).toEqual({ label: 'Pago parcial', variant: 'outline' })
    expect(invoiceBadge(row({ total: 2380, creditTotal: 0, paymentStatus: 'unpaid' }))).toEqual({ label: 'Pendiente', variant: 'outline' })
  })
  it('un documento sin total conocido sigue como antes', () => {
    expect(invoiceBadge(row({ paymentStatus: 'paid' }))).toEqual({ label: 'Pagada', variant: 'secondary' })
  })
})
