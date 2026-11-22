import { describe, expect, it } from 'vitest'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import { documentPrefix, formatDocumentNumber } from './documentNumber'

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

describe('formatDocumentNumber · nota de crédito', () => {
  it('usa NC si la empresa no configuró prefijo para notas de crédito', () => {
    expect(formatDocumentNumber({ invoice: 'F' }, 'credit_note', 7)).toBe('NC-000007')
  })
  it('respeta el prefijo configurado', () => {
    expect(formatDocumentNumber({ credit_note: 'CR' }, 'credit_note', 12)).toBe('CR-000012')
  })
  it('un borrador no tiene número', () => {
    expect(formatDocumentNumber({}, 'credit_note', null)).toBe('Borrador')
  })
})

describe('documentPrefix', () => {
  it('el prefijo de la empresa o el de fábrica', () => {
    expect(documentPrefix({ invoice: 'FAC' }, 'invoice')).toBe('FAC')
    expect(documentPrefix({}, 'invoice')).toBe('F')
    expect(documentPrefix({}, 'sales_note')).toBe('NV')
    expect(documentPrefix({}, 'credit_note')).toBe('NC')
    expect(documentPrefix({ credit_note: 'CR' }, 'credit_note')).toBe('CR')
  })
})
