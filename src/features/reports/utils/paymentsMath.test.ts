import { describe, expect, it } from 'vitest'
import { averagePayment } from './paymentsMath'

describe('averagePayment', () => {
  it('divide lo cobrado entre la cantidad de cobros y redondea a los decimales de la moneda', () => {
    expect(averagePayment(85_000, 7, 0)).toBe(12_143)
    expect(averagePayment(100, 3, 2)).toBe(33.33)
    expect(averagePayment(100, 3, 0)).toBe(33)
  })

  it('sin cobros es 0, no NaN ni infinito', () => {
    expect(averagePayment(0, 0, 2)).toBe(0)
    expect(averagePayment(500, 0, 0)).toBe(0)
    expect(averagePayment(500, -1, 0)).toBe(0)
  })

  it('redondea la mitad hacia arriba', () => {
    expect(averagePayment(5, 2, 0)).toBe(3)
    expect(averagePayment(1, 8, 2)).toBe(0.13)
  })
})
