import { describe, expect, it } from 'vitest'
import { normalizeTaxId } from './taxId'

describe('normalizeTaxId', () => {
  it('quita puntos y espacios y pasa a mayúsculas', () => {
    expect(normalizeTaxId('76.123.456-k')).toBe('76123456-K')
    expect(normalizeTaxId(' 76 123 456 - 7 ')).toBe('76123456-7')
  })

  it('distintas maneras de escribir lo mismo dan el mismo resultado', () => {
    const forms = ['76.123.456-7', '76123456-7', ' 76.123.456 -7', '76 123 456-7']
    expect(new Set(forms.map(normalizeTaxId)).size).toBe(1)
  })

  it('conserva guiones y letras: no asume el formato de ningún país', () => {
    expect(normalizeTaxId('20-12345678-9')).toBe('20-12345678-9') // CUIT
    expect(normalizeTaxId('b12345678')).toBe('B12345678') // NIF
  })

  it('es idempotente y tolera el vacío', () => {
    expect(normalizeTaxId(normalizeTaxId('76.123.456-k'))).toBe('76123456-K')
    expect(normalizeTaxId('')).toBe('')
    expect(normalizeTaxId(' . ')).toBe('')
  })
})
