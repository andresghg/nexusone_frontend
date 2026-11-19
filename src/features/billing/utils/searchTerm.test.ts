import { describe, expect, it } from 'vitest'
import { parseNumberSearch } from './searchTerm'

describe('parseNumberSearch', () => {
  it('reconoce el número, con o sin prefijo', () => {
    expect(parseNumberSearch('12')).toEqual({ prefix: '', number: 12 })
    expect(parseNumberSearch('#12')).toEqual({ prefix: '', number: 12 })
    expect(parseNumberSearch('  000012  ')).toEqual({ prefix: '', number: 12 })
    expect(parseNumberSearch('F-000012')).toEqual({ prefix: 'F', number: 12 })
    expect(parseNumberSearch('f 12')).toEqual({ prefix: 'F', number: 12 })
    expect(parseNumberSearch('nv-5')).toEqual({ prefix: 'NV', number: 5 })
    expect(parseNumberSearch('FAC12')).toEqual({ prefix: 'FAC', number: 12 })
  })

  it('no confunde nombres, RUT ni números enormes con un número de documento', () => {
    expect(parseNumberSearch('Ana Pérez')).toBeNull()
    expect(parseNumberSearch('76.123.456-7')).toBeNull()
    expect(parseNumberSearch('12345678-5')).toBeNull()
    expect(parseNumberSearch('1234567890')).toBeNull() // 10 dígitos
    expect(parseNumberSearch('abcdef-1')).toBeNull() // prefijo de más de 5 letras
    expect(parseNumberSearch('')).toBeNull()
  })

  it('el cero no es un número de documento', () => {
    expect(parseNumberSearch('0')).toBeNull()
    expect(parseNumberSearch('F-000000')).toBeNull()
  })
})
