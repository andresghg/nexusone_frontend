import { describe, expect, it } from 'vitest'
import { formatQuantity, fromMilli, milliToNumber, toMilli } from './stockMath'

describe('stockMath', () => {
  it('convierte a milésimas y de vuelta sin errores de coma flotante', () => {
    expect(0.1 + 0.2).not.toBe(0.3) // el problema que evitamos
    expect(toMilli(0.1) + toMilli(0.2)).toBe(300)
    expect(milliToNumber(toMilli(0.1) + toMilli(0.2))).toBe(0.3)
  })

  it('acepta números y textos de numeric', () => {
    expect(toMilli('5.500')).toBe(5500)
    expect(toMilli(5.5)).toBe(5500)
    expect(toMilli('-3.5')).toBe(-3500)
  })

  it('fromMilli entrega 3 decimales con signo, listo para la base de datos', () => {
    expect(fromMilli(12500)).toBe('12.500')
    expect(fromMilli(-4000)).toBe('-4.000')
    expect(fromMilli(0)).toBe('0.000')
  })

  it('formatQuantity quita ceros sobrantes para los mensajes', () => {
    expect(formatQuantity(5500)).toBe('5.5')
    expect(formatQuantity(12000)).toBe('12')
    expect(formatQuantity(0)).toBe('0')
  })
})
