import { describe, expect, it } from 'vitest'
import { planStockDeductions, type StockRequest } from './stockPlan'

const req = (productId: string, quantity: number, over: Partial<StockRequest> = {}): StockRequest => ({
  productId,
  name: `Producto ${productId}`,
  unit: 'un',
  quantity,
  ...over,
})
const stock = (entries: Record<string, number | string>) => new Map(Object.entries(entries))

describe('planStockDeductions', () => {
  it('con stock suficiente devuelve cuánto descontar, en milésimas', () => {
    expect(planStockDeductions([req('a', 2), req('b', 1.5)], stock({ a: 10, b: 5 }), false)).toEqual({
      ok: true,
      deductions: [
        { productId: 'a', milli: 2000 },
        { productId: 'b', milli: 1500 },
      ],
    })
  })

  it('pedir exactamente lo que hay alcanza; una milésima más no', () => {
    expect(planStockDeductions([req('a', 5)], stock({ a: 5 }), false).ok).toBe(true)
    expect(planStockDeductions([req('a', 5.001)], stock({ a: 5 }), false)).toMatchObject({
      ok: false,
      shortages: [{ productId: 'a', available: 5000, requested: 5001 }],
    })
  })

  it('un producto repetido en varias líneas se suma antes de validar', () => {
    expect(planStockDeductions([req('a', 3), req('a', 3)], stock({ a: 5 }), false)).toMatchObject({
      ok: false,
      shortages: [{ productId: 'a', available: 5000, requested: 6000 }],
    })
    expect(planStockDeductions([req('a', 2), req('a', 3)], stock({ a: 5 }), false)).toEqual({
      ok: true,
      deductions: [{ productId: 'a', milli: 5000 }], // un solo descuento por producto
    })
  })

  it('informa todos los productos que no alcanzan, en el orden en que aparecen', () => {
    const plan = planStockDeductions(
      [req('a', 5, { name: 'Pan', unit: 'kg' }), req('b', 1), req('c', 9, { name: 'Té' })],
      stock({ a: 1, b: 10, c: 2 }),
      false,
    )
    expect(plan).toEqual({
      ok: false,
      shortages: [
        { productId: 'a', name: 'Pan', unit: 'kg', available: 1000, requested: 5000 },
        { productId: 'c', name: 'Té', unit: 'un', available: 2000, requested: 9000 },
      ],
    })
  })

  it('un producto sin movimientos tiene stock 0', () => {
    expect(planStockDeductions([req('a', 1)], stock({}), false)).toMatchObject({
      ok: false,
      shortages: [{ available: 0, requested: 1000 }],
    })
  })

  it('con "permitir stock negativo" nunca rechaza, aunque no haya nada', () => {
    expect(planStockDeductions([req('a', 4)], stock({ a: 1 }), true)).toEqual({
      ok: true,
      deductions: [{ productId: 'a', milli: 4000 }],
    })
    expect(planStockDeductions([req('a', 4)], stock({}), true).ok).toBe(true)
  })

  it('sin errores de coma flotante: 0,1 + 0,2 con stock 0,3 alcanza justo', () => {
    expect(planStockDeductions([req('a', 0.1), req('a', 0.2)], stock({ a: 0.3 }), false)).toEqual({
      ok: true,
      deductions: [{ productId: 'a', milli: 300 }],
    })
  })

  it('acepta el stock como texto, tal como lo entrega numeric de Postgres', () => {
    expect(planStockDeductions([req('a', 10.5)], stock({ a: '10.500' }), false).ok).toBe(true)
    expect(planStockDeductions([req('a', 10.501)], stock({ a: '10.500' }), false).ok).toBe(false)
  })

  it('sin pedidos no hay nada que descontar', () => {
    expect(planStockDeductions([], stock({ a: 1 }), false)).toEqual({ ok: true, deductions: [] })
  })

  it('si el stock ya estaba negativo, informa lo disponible tal cual', () => {
    expect(planStockDeductions([req('a', 1)], stock({ a: -2 }), false)).toMatchObject({
      ok: false,
      shortages: [{ available: -2000 }],
    })
  })
})
