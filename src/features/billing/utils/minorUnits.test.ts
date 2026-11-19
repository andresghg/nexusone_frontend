import { describe, expect, it } from 'vitest'
import { fromMinorUnits, toMinorUnits } from './minorUnits'

describe('toMinorUnits', () => {
  it('convierte a unidades mínimas según los decimales de la moneda', () => {
    expect(toMinorUnits(1190, 0)).toBe(1190)
    expect(toMinorUnits(19.99, 2)).toBe(1999)
    expect(toMinorUnits(10.5, 1)).toBe(105)
    expect(toMinorUnits(0, 2)).toBe(0)
  })

  it('no arrastra errores de coma flotante', () => {
    expect(toMinorUnits(0.1 + 0.2, 2)).toBe(30)
    expect(toMinorUnits(1.005 * 1000, 0)).toBe(1005)
    expect(toMinorUnits(999_999_999_999.99, 2)).toBe(99_999_999_999_999)
  })

  it('null si tiene más decimales de los que admite la moneda', () => {
    expect(toMinorUnits(10.5, 0)).toBeNull()
    expect(toMinorUnits(10.555, 2)).toBeNull()
    expect(toMinorUnits(0.001, 2)).toBeNull()
  })

  it('null si no es un monto válido', () => {
    expect(toMinorUnits(-1, 0)).toBeNull()
    expect(toMinorUnits(NaN, 2)).toBeNull()
    expect(toMinorUnits(Infinity, 2)).toBeNull()
  })
})

describe('fromMinorUnits', () => {
  it('vuelve a la unidad de la moneda', () => {
    expect(fromMinorUnits(1999, 2)).toBe(19.99)
    expect(fromMinorUnits(1190, 0)).toBe(1190)
    expect(fromMinorUnits(105, 1)).toBe(10.5)
  })
})
