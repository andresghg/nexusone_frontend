import { describe, expect, it } from 'vitest'
import { planRestock } from './creditNoteStock'

const line = (over = {}) => ({ productId: 'a', quantity: 1, tracksStock: true, restock: true, ...over })

describe('planRestock', () => {
  it('devuelve las unidades elegidas', () => {
    expect(planRestock([line({ quantity: 2 })])).toEqual([{ productId: 'a', milli: 2000 }])
  })
  it('suma un producto repetido en varias líneas en un solo movimiento', () => {
    expect(planRestock([line({ quantity: 1.5 }), line({ quantity: 0.25 }), line({ productId: 'b' })])).toEqual([
      { productId: 'a', milli: 1750 },
      { productId: 'b', milli: 1000 },
    ])
  })
  it('ignora lo que no se devuelve, lo que no controla stock y los conceptos libres', () => {
    expect(
      planRestock([line({ restock: false }), line({ tracksStock: false }), line({ productId: null })]),
    ).toEqual([])
  })
  it('sin ruido de coma flotante', () => {
    expect(planRestock([line({ quantity: 0.1 }), line({ quantity: 0.2 })])).toEqual([{ productId: 'a', milli: 300 }])
  })
})
