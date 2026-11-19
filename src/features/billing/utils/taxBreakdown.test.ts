import { describe, expect, it } from 'vitest'
import { taxBreakdownOf } from './taxBreakdown'

const item = (taxRate: number, lineNet: number, lineTax: number) => ({ taxRate, lineNet, lineTax })

describe('taxBreakdownOf', () => {
  it('agrupa por tasa y las ordena de menor a mayor, con exentos primero', () => {
    expect(taxBreakdownOf([item(19, 1000, 190), item(0, 500, 0), item(19, 2000, 380), item(10.5, 100, 11)], 0)).toEqual([
      { rate: 0, base: 500, tax: 0 },
      { rate: 10.5, base: 100, tax: 11 },
      { rate: 19, base: 3000, tax: 570 },
    ])
  })

  it('suma en unidades mínimas: sin errores de coma flotante', () => {
    expect(taxBreakdownOf([item(19, 0.1, 0.02), item(19, 0.2, 0.04)], 2)).toEqual([{ rate: 19, base: 0.3, tax: 0.06 }])
  })

  it('sin líneas no hay desglose', () => {
    expect(taxBreakdownOf([], 0)).toEqual([])
  })
})
