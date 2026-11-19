import { describe, expect, it } from 'vitest'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import { formatDocumentNumber } from './documentNumber'

const prefixes = DEFAULT_BILLING_SETTINGS.documentPrefixes

describe('formatDocumentNumber', () => {
  it('prefijo + número con ceros a la izquierda', () => {
    expect(formatDocumentNumber(prefixes, 'invoice', 123)).toBe('F-000123')
    expect(formatDocumentNumber(prefixes, 'receipt', 1)).toBe('R-000001')
    expect(formatDocumentNumber(prefixes, 'sales_note', 42)).toBe('NV-000042')
  })

  it('un borrador no tiene número', () => {
    expect(formatDocumentNumber(prefixes, 'invoice', null)).toBe('Borrador')
  })

  it('no recorta números más largos que el ancho', () => {
    expect(formatDocumentNumber(prefixes, 'invoice', 1_234_567)).toBe('F-1234567')
  })

  it('usa el prefijo configurado por la empresa', () => {
    expect(formatDocumentNumber({ ...prefixes, invoice: 'FAC' }, 'invoice', 7)).toBe('FAC-000007')
  })

  it('si falta el prefijo del tipo, usa el de por defecto', () => {
    expect(formatDocumentNumber({}, 'invoice', 7)).toBe('F-000007')
  })

  it('el ancho es configurable', () => {
    expect(formatDocumentNumber(prefixes, 'invoice', 7, 3)).toBe('F-007')
  })
})
