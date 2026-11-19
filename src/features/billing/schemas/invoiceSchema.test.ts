import { describe, expect, it } from 'vitest'
import { MAX_INVOICE_LINES } from '../types/billing'
import { IssueInvoiceSchema, VoidInvoiceSchema } from './invoiceSchema'

const PRODUCT = '33333333-3333-4333-8333-333333333333'
const KEY = '44444444-4444-4444-8444-444444444444'

const line = (over = {}) => ({
  productId: PRODUCT, description: '', unit: '', quantity: 1, unitPrice: 0,
  discountType: 'percent', discountValue: 0, taxRate: null, ...over,
})
const invoice = (over = {}) => ({
  documentType: 'invoice', customerId: null, dueDate: null, notes: '', paid: false,
  idempotencyKey: KEY, lines: [line()], ...over,
})
const firstError = (input: unknown) => {
  const result = IssueInvoiceSchema.safeParse(input)
  return result.success ? null : result.error.issues[0].message
}

describe('IssueInvoiceSchema', () => {
  it('acepta un documento con un producto del catálogo', () => {
    expect(IssueInvoiceSchema.safeParse(invoice()).success).toBe(true)
  })

  it('exige al menos una línea y respeta el máximo', () => {
    expect(firstError(invoice({ lines: [] }))).toBe('Agrega al menos un producto')
    expect(firstError(invoice({ lines: Array.from({ length: MAX_INVOICE_LINES + 1 }, () => line()) }))).toBe(
      `Máximo ${MAX_INVOICE_LINES} líneas por documento`,
    )
  })

  it('un concepto libre necesita descripción; un producto del catálogo no', () => {
    expect(firstError(invoice({ lines: [line({ productId: null, description: '  ' })] }))).toBe('Describe el concepto')
    expect(IssueInvoiceSchema.safeParse(invoice({ lines: [line({ productId: null, description: 'Flete', unitPrice: 5000 })] })).success).toBe(true)
  })

  it('valida los identificadores', () => {
    expect(firstError(invoice({ idempotencyKey: 'abc' }))).toBe('Clave de solicitud inválida')
    expect(firstError(invoice({ customerId: 'x' }))).toBe('Cliente inválido')
    expect(firstError(invoice({ lines: [line({ productId: 'x' })] }))).toBe('Producto inválido')
  })

  it('tipo de documento y tipo de descuento deben existir', () => {
    expect(firstError(invoice({ documentType: 'boleta' }))).toBe('Tipo de documento inválido')
    expect(firstError(invoice({ lines: [line({ discountType: 'otro' })] }))).toBe('Tipo de descuento inválido')
  })

  it('el vencimiento debe ser una fecha real o null', () => {
    expect(IssueInvoiceSchema.safeParse(invoice({ dueDate: '2026-12-31' })).success).toBe(true)
    expect(firstError(invoice({ dueDate: '2026-02-30' }))).toBe('Fecha de vencimiento inválida')
    expect(firstError(invoice({ dueDate: '31/12/2026' }))).toBe('Fecha de vencimiento inválida')
  })

  it('los números deben ser números, no texto ni NaN', () => {
    expect(firstError(invoice({ lines: [line({ quantity: '2' })] }))).toBe('La cantidad debe ser un número')
    expect(firstError(invoice({ lines: [line({ quantity: NaN })] }))).toBe('La cantidad debe ser un número')
    expect(firstError(invoice({ lines: [line({ taxRate: '19' })] }))).toBe('El impuesto debe ser un número')
  })

  it('recorta y limita las notas y la descripción', () => {
    const ok = IssueInvoiceSchema.safeParse(invoice({ notes: '  hola  ' }))
    expect(ok.success && ok.data.notes).toBe('hola')
    expect(firstError(invoice({ notes: 'a'.repeat(501) }))).toBe('Las notas admiten máximo 500 caracteres')
    expect(firstError(invoice({ lines: [line({ productId: null, description: 'a'.repeat(201) })] }))).toBe(
      'La descripción admite máximo 200 caracteres',
    )
  })
})

describe('VoidInvoiceSchema', () => {
  const id = '55555555-5555-4555-8555-555555555555'

  it('exige documento válido y un motivo', () => {
    expect(VoidInvoiceSchema.safeParse({ invoiceId: id, reason: 'Error de digitación' }).success).toBe(true)
    expect(VoidInvoiceSchema.safeParse({ invoiceId: 'x', reason: 'Error' }).success).toBe(false)
  })

  it('el motivo se recorta y tiene largo mínimo y máximo', () => {
    const result = VoidInvoiceSchema.safeParse({ invoiceId: id, reason: '  Duplicada  ' })
    expect(result.success && result.data.reason).toBe('Duplicada')
    expect(VoidInvoiceSchema.safeParse({ invoiceId: id, reason: '  ab ' }).error?.issues[0].message).toBe('Indica el motivo de la anulación')
    expect(VoidInvoiceSchema.safeParse({ invoiceId: id, reason: 'a'.repeat(201) }).error?.issues[0].message).toBe('El motivo admite máximo 200 caracteres')
  })
})
