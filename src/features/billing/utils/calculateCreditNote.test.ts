import { describe, expect, it } from 'vitest'
import { calculateCreditNote, type CreditSourceLine } from './calculateCreditNote'

const none = { quantity: 0, gross: 0, discount: 0, net: 0, tax: 0, total: 0 }
const source = (over: Partial<CreditSourceLine> = {}): CreditSourceLine => ({
  quantity: 2,
  taxRate: 19,
  // 2 × 11.900 con 10 % de descuento, IVA incluido (el ejemplo de la prueba de facturación)
  original: { gross: 23800, discount: 2380, net: 18000, tax: 3420, total: 21420 },
  credited: none,
  ...over,
})
const ok = (r: ReturnType<typeof calculateCreditNote>) => {
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('calculateCreditNote', () => {
  it('acredita una parte con los montos originales (descuento incluido), no con el precio de hoy', () => {
    const r = ok(calculateCreditNote([{ source: source(), quantity: 1 }], { currencyDecimals: 0 }))
    expect(r.lines[0]).toMatchObject({ gross: 11900, discount: 1190, net: 9000, tax: 1710, total: 10710, closesLine: false })
    expect(r.totals).toMatchObject({ subtotal: 9000, discountTotal: 1190, taxTotal: 1710, total: 10710 })
  })

  it('acreditar todo lo que queda toma el restante exacto y cierra la línea', () => {
    const r = ok(calculateCreditNote([{ source: source(), quantity: 2 }], { currencyDecimals: 0 }))
    expect(r.lines[0]).toMatchObject({ gross: 23800, discount: 2380, net: 18000, tax: 3420, total: 21420, closesLine: true })
  })

  it('segunda nota: reparte lo que quedaba, no lo original', () => {
    const credited = { quantity: 1, gross: 11900, discount: 1190, net: 9000, tax: 1710, total: 10710 }
    const r = ok(calculateCreditNote([{ source: source({ credited }), quantity: 1 }], { currencyDecimals: 0 }))
    expect(r.lines[0]).toMatchObject({ total: 10710, closesLine: true })
  })

  it('el redondeo no deja sobras: tres notas de 1 unidad suman exactamente el original', () => {
    const original = { gross: 100, discount: 0, net: 84, tax: 16, total: 100 }
    let credited = { ...none }
    const totals: number[] = []
    for (let i = 0; i < 3; i++) {
      const r = ok(calculateCreditNote([{ source: { quantity: 3, taxRate: 19, original, credited }, quantity: 1 }], { currencyDecimals: 0 }))
      const l = r.lines[0]
      totals.push(l.total)
      credited = {
        quantity: credited.quantity + 1,
        gross: credited.gross + l.gross, discount: credited.discount + l.discount,
        net: credited.net + l.net, tax: credited.tax + l.tax, total: credited.total + l.total,
      }
    }
    expect(totals).toEqual([33, 34, 33])
    expect(credited).toMatchObject({ quantity: 3, gross: 100, net: 84, tax: 16, total: 100 })
  })

  it('propiedad: acreditar unidad por unidad nunca supera ni se queda corto respecto del original', () => {
    let seed = 12345
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % max
    }
    for (let n = 0; n < 200; n++) {
      const qty = 1 + rand(9)
      const total = 1 + rand(100000)
      const net = Math.round(total / 1.19)
      const gross = total + rand(500)
      const original = { gross, discount: Math.min(rand(500), gross), net, tax: total - net, total }
      let credited = { ...none }
      for (let i = 0; i < qty; i++) {
        const result = calculateCreditNote([{ source: { quantity: qty, taxRate: 19, original, credited }, quantity: 1 }], { currencyDecimals: 0 })
        // Una unidad que por redondeo vale 0 no forma una nota válida; el reparto sigue siendo exacto igualmente.
        const r = result.ok ? result : { lines: [{ gross: 0, discount: 0, net: 0, tax: 0, total: 0 }] }
        const l = r.lines[0]
        expect(l.discount).toBeLessThanOrEqual(l.gross)
        expect(l.total).toBe(l.net + l.tax)
        credited = {
          quantity: credited.quantity + 1,
          gross: credited.gross + l.gross, discount: credited.discount + l.discount,
          net: credited.net + l.net, tax: credited.tax + l.tax, total: credited.total + l.total,
        }
        expect(credited.total).toBeLessThanOrEqual(original.total)
      }
      expect(credited.total).toBe(original.total)
      expect(credited.net).toBe(original.net)
      expect(credited.tax).toBe(original.tax)
    }
  })

  it('el descuento acreditado nunca supera el bruto, aunque los redondeos previos lo desordenen', () => {
    const original = { gross: 100, discount: 100, net: 0, tax: 0, total: 0 }
    const credited = { quantity: 2, gross: 34, discount: 33, net: 0, tax: 0, total: 0 }
    // quedan: bruto 66, descuento 67 → el descuento se limita al bruto
    const r = calculateCreditNote(
      [{ source: { quantity: 3, taxRate: 0, original: { ...original, net: 10, tax: 0, total: 10 }, credited }, quantity: 1 }],
      { currencyDecimals: 0 },
    )
    expect(ok(r).lines[0].discount).toBeLessThanOrEqual(ok(r).lines[0].gross)
  })

  it('mezcla líneas con y sin impuesto y arma el desglose por tasa', () => {
    const exempt: CreditSourceLine = {
      quantity: 1, taxRate: 0,
      original: { gross: 10000, discount: 0, net: 10000, tax: 0, total: 10000 }, credited: none,
    }
    const r = ok(calculateCreditNote([{ source: source(), quantity: 1 }, { source: exempt, quantity: 1 }], { currencyDecimals: 0 }))
    expect(r.totals.total).toBe(20710)
    expect(r.totals.taxBreakdown).toEqual([
      { rate: 0, base: 10000, tax: 0 },
      { rate: 19, base: 9000, tax: 1710 },
    ])
  })

  it('cantidades con decimales (3 como máximo) y montos con 2 decimales de moneda', () => {
    const usd: CreditSourceLine = {
      quantity: 2.5, taxRate: 10,
      original: { gross: 25, discount: 0, net: 22.73, tax: 2.27, total: 25 }, credited: none,
    }
    const r = ok(calculateCreditNote([{ source: usd, quantity: 1.25 }], { currencyDecimals: 2 }))
    expect(r.lines[0]).toMatchObject({ gross: 12.5, net: 11.37, tax: 1.14, total: 12.51 })
    expect(r.lines[0].closesLine).toBe(false)
  })

  describe('validaciones', () => {
    const run = (quantity: number, over: Partial<CreditSourceLine> = {}) =>
      calculateCreditNote([{ source: source(over), quantity }], { currencyDecimals: 0 })

    it('cantidad 0, negativa o no numérica', () => {
      for (const q of [0, -1, NaN, Infinity]) expect(run(q)).toEqual({ ok: false, error: 'Línea 1: la cantidad debe ser mayor a 0' })
    })
    it('más de 3 decimales', () => {
      expect(run(0.0001)).toEqual({ ok: false, error: 'Línea 1: la cantidad admite máximo 3 decimales' })
    })
    it('más de lo que queda por acreditar', () => {
      expect(run(3)).toEqual({ ok: false, error: 'Línea 1: solo quedan 2 por acreditar' })
      const credited = { quantity: 1, gross: 11900, discount: 1190, net: 9000, tax: 1710, total: 10710 }
      expect(run(2, { credited })).toEqual({ ok: false, error: 'Línea 1: solo quedan 1 por acreditar' })
    })
    it('línea ya acreditada por completo', () => {
      const credited = { quantity: 2, ...source().original }
      expect(run(1, { credited })).toEqual({ ok: false, error: 'Línea 1: ya está acreditada por completo' })
    })
    it('datos inconsistentes (lo acreditado supera lo facturado)', () => {
      const credited = { quantity: 1, gross: 99999, discount: 0, net: 0, tax: 0, total: 0 }
      expect(run(1, { credited }).ok).toBe(false)
    })
    it('sin líneas y demasiadas líneas', () => {
      expect(calculateCreditNote([], { currencyDecimals: 0 })).toEqual({ ok: false, error: 'Elige al menos una línea para acreditar' })
      const many = Array.from({ length: 201 }, () => ({ source: source(), quantity: 1 }))
      expect(calculateCreditNote(many, { currencyDecimals: 0 }).ok).toBe(false)
    })
    it('decimales de moneda inválidos', () => {
      expect(calculateCreditNote([{ source: source(), quantity: 1 }], { currencyDecimals: 3 }).ok).toBe(false)
    })
    it('el error indica el número de línea', () => {
      const r = calculateCreditNote([{ source: source(), quantity: 1 }, { source: source(), quantity: 5 }], { currencyDecimals: 0 })
      expect(r).toEqual({ ok: false, error: 'Línea 2: solo quedan 2 por acreditar' })
    })
    it('una nota de total 0 no tiene sentido', () => {
      const free: CreditSourceLine = {
        quantity: 1, taxRate: 0,
        original: { gross: 0, discount: 0, net: 0, tax: 0, total: 0 }, credited: none,
      }
      expect(calculateCreditNote([{ source: free, quantity: 1 }], { currencyDecimals: 0 })).toEqual({
        ok: false, error: 'El total de la nota de crédito debe ser mayor a 0',
      })
    })
  })
})
