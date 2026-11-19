import { describe, expect, it } from 'vitest'
import { MAX_INVOICE_LINES } from '../types/billing'
import {
  calculateInvoice,
  toMoneyString,
  type CalcOptions,
  type LineInput,
  type LineTotals,
} from './calculateInvoice'

const line = (over: Partial<LineInput> = {}): LineInput => ({
  quantity: 1,
  unitPrice: 1000,
  discountType: 'percent',
  discountValue: 0,
  taxRate: 19,
  ...over,
})

const CLP_NET: CalcOptions = { pricesIncludeTax: false, currencyDecimals: 0 } // precios sin impuesto
const CLP_GROSS: CalcOptions = { pricesIncludeTax: true, currencyDecimals: 0 } // precios con impuesto
const USD_NET: CalcOptions = { pricesIncludeTax: false, currencyDecimals: 2 }

// Falla el test si el cálculo no es ok y entrega el resultado ya estrechado.
function calc(lines: LineInput[], options: CalcOptions) {
  const result = calculateInvoice(lines, options)
  if (!result.ok) throw new Error(`se esperaba ok, vino: ${result.error}`)
  return result
}

describe('calculateInvoice · precios sin impuesto', () => {
  it('2 × 1000 con 19%: neto 2000, impuesto 380, total 2380', () => {
    const r = calc([line({ quantity: 2 })], CLP_NET)
    expect(r.lines[0]).toEqual({ gross: 2000, discount: 0, net: 2000, tax: 380, total: 2380 })
    expect(r.totals).toMatchObject({ subtotal: 2000, discountTotal: 0, taxTotal: 380, total: 2380 })
  })

  it('redondea el impuesto mitad hacia arriba (0,5 → 1)', () => {
    const r = calc([line({ unitPrice: 1, taxRate: 50 })], CLP_NET)
    expect(r.lines[0]).toMatchObject({ net: 1, tax: 1, total: 2 })
  })

  it('cantidades con decimales: 0,5 kg × 1990 = 995', () => {
    const r = calc([line({ quantity: 0.5, unitPrice: 1990, taxRate: 0 })], CLP_NET)
    expect(r.lines[0].gross).toBe(995)
  })

  it('no arrastra errores de coma flotante: 3 × 0,10 = 0,30 exacto', () => {
    const r = calc([line({ quantity: 3, unitPrice: 0.1, taxRate: 0 })], USD_NET)
    expect(r.lines[0].total).toBe(0.3)
  })

  it('moneda con 2 decimales: 3 × 19,99 con 10% = 59,97 + 6,00', () => {
    const r = calc([line({ quantity: 3, unitPrice: 19.99, taxRate: 10 })], USD_NET)
    expect(r.lines[0]).toEqual({ gross: 59.97, discount: 0, net: 59.97, tax: 6, total: 65.97 })
  })

  it('un precio con centavos en una moneda sin decimales se redondea en la línea', () => {
    const r = calc([line({ unitPrice: 99.5, taxRate: 0 })], CLP_NET)
    expect(r.lines[0].gross).toBe(100)
  })
})

describe('calculateInvoice · precios con impuesto incluido', () => {
  it('1190 con 19%: neto 1000, impuesto 190, total 1190', () => {
    const r = calc([line({ unitPrice: 1190 })], CLP_GROSS)
    expect(r.lines[0]).toEqual({ gross: 1190, discount: 0, net: 1000, tax: 190, total: 1190 })
  })

  it('el total nunca cambia: 100 con 19% → neto 84 + impuesto 16', () => {
    const r = calc([line({ unitPrice: 100 })], CLP_GROSS)
    expect(r.lines[0]).toMatchObject({ net: 84, tax: 16, total: 100 })
  })

  it('0,5 kg × 1990 con 19%: total 995, neto 836, impuesto 159', () => {
    const r = calc([line({ quantity: 0.5, unitPrice: 1990 })], CLP_GROSS)
    expect(r.lines[0]).toMatchObject({ net: 836, tax: 159, total: 995 })
  })
})

describe('calculateInvoice · descuentos', () => {
  it('porcentaje: 10% sobre 2000 → descuento 200, neto 1800, impuesto 342', () => {
    const r = calc([line({ quantity: 2, discountValue: 10 })], CLP_NET)
    expect(r.lines[0]).toEqual({ gross: 2000, discount: 200, net: 1800, tax: 342, total: 2142 })
    expect(r.totals.discountTotal).toBe(200)
  })

  it('monto fijo: 500 sobre 2000', () => {
    const r = calc([line({ quantity: 2, discountType: 'amount', discountValue: 500 })], CLP_NET)
    expect(r.lines[0]).toMatchObject({ discount: 500, net: 1500, tax: 285, total: 1785 })
  })

  it('con impuesto incluido, el descuento se aplica sobre el precio con impuesto', () => {
    const r = calc([line({ unitPrice: 1190, discountValue: 50 })], CLP_GROSS)
    expect(r.lines[0]).toMatchObject({ gross: 1190, discount: 595, total: 595, net: 500, tax: 95 })
  })

  it('100% de descuento deja la línea en cero', () => {
    const r = calc([line({ discountValue: 100 })], CLP_NET)
    expect(r.lines[0]).toMatchObject({ net: 0, tax: 0, total: 0 })
  })

  it('un descuento mayor al monto de la línea se rechaza', () => {
    expect(calculateInvoice([line({ discountType: 'amount', discountValue: 1001 })], CLP_NET)).toEqual({
      ok: false,
      error: 'Línea 1: el descuento supera el monto de la línea',
    })
  })

  it('el descuento fijo respeta los decimales de la moneda', () => {
    expect(calculateInvoice([line({ discountType: 'amount', discountValue: 10.5 })], CLP_NET)).toEqual({
      ok: false,
      error: 'Línea 1: el descuento debe ser un monto entero',
    })
    expect(calc([line({ discountType: 'amount', discountValue: 10.5 })], USD_NET).lines[0].discount).toBe(10.5)
  })
})

describe('calculateInvoice · varias líneas e impuestos', () => {
  it('el documento es la suma de las líneas ya redondeadas', () => {
    const r = calc([line({ unitPrice: 100 }), line({ unitPrice: 100 }), line({ unitPrice: 100 })], CLP_GROSS)
    // cada línea: neto 84 + impuesto 16 = 100 → el documento suma 252 + 48 = 300
    expect(r.totals).toMatchObject({ subtotal: 252, taxTotal: 48, total: 300 })
  })

  it('líneas exentas (0%) y gravadas: desglose por tasa ordenado', () => {
    const r = calc([line({ unitPrice: 1000 }), line({ unitPrice: 500, taxRate: 0 })], CLP_NET)
    expect(r.totals.taxBreakdown).toEqual([
      { rate: 0, base: 500, tax: 0 },
      { rate: 19, base: 1000, tax: 190 },
    ])
    expect(r.totals).toMatchObject({ subtotal: 1500, taxTotal: 190, total: 1690 })
  })

  it('agrupa las líneas de la misma tasa y admite tasas con decimales', () => {
    const r = calc([line({ taxRate: 10.5 }), line({ taxRate: 10.5 }), line({ taxRate: 19 })], CLP_NET)
    expect(r.totals.taxBreakdown.map((x) => x.rate)).toEqual([10.5, 19])
    expect(r.totals.taxBreakdown[0]).toEqual({ rate: 10.5, base: 2000, tax: 210 })
  })

  it('un precio en cero es válido (obsequio)', () => {
    const r = calc([line({ unitPrice: 0 })], CLP_NET)
    expect(r.totals.total).toBe(0)
  })

  it('no modifica los datos de entrada', () => {
    const input = [line({ quantity: 2, discountValue: 10 })]
    const copy = structuredClone(input)
    calc(input, CLP_NET)
    expect(input).toEqual(copy)
  })
})

describe('calculateInvoice · validación', () => {
  const rejects = (lines: LineInput[], error: string, options = CLP_NET) =>
    expect(calculateInvoice(lines, options)).toEqual({ ok: false, error })

  it('exige al menos una línea y respeta el máximo', () => {
    rejects([], 'Agrega al menos un producto')
    rejects(
      Array.from({ length: MAX_INVOICE_LINES + 1 }, () => line()),
      `Máximo ${MAX_INVOICE_LINES} líneas por documento`,
    )
    expect(calculateInvoice(Array.from({ length: MAX_INVOICE_LINES }, () => line()), CLP_NET).ok).toBe(true)
  })

  it('indica el número de la línea con el problema', () => {
    rejects([line(), line({ quantity: 0 })], 'Línea 2: la cantidad debe ser mayor a 0')
  })

  it('cantidad: mayor a 0, finita y máximo 3 decimales', () => {
    rejects([line({ quantity: 0 })], 'Línea 1: la cantidad debe ser mayor a 0')
    rejects([line({ quantity: -1 })], 'Línea 1: la cantidad debe ser mayor a 0')
    rejects([line({ quantity: NaN })], 'Línea 1: la cantidad debe ser mayor a 0')
    rejects([line({ quantity: Infinity })], 'Línea 1: la cantidad debe ser mayor a 0')
    rejects([line({ quantity: 1.0005 })], 'Línea 1: la cantidad admite máximo 3 decimales')
    rejects([line({ quantity: 100_000_000 })], 'Línea 1: la cantidad es demasiado grande')
  })

  it('precio: no negativo y máximo 2 decimales', () => {
    rejects([line({ unitPrice: -1 })], 'Línea 1: el precio no puede ser negativo')
    rejects([line({ unitPrice: NaN })], 'Línea 1: el precio no puede ser negativo')
    rejects([line({ unitPrice: 1.234 })], 'Línea 1: el precio admite máximo 2 decimales')
  })

  it('impuesto: entre 0 y 100 con máximo 2 decimales', () => {
    rejects([line({ taxRate: -1 })], 'Línea 1: el impuesto debe estar entre 0% y 100%')
    rejects([line({ taxRate: 101 })], 'Línea 1: el impuesto debe estar entre 0% y 100%')
    rejects([line({ taxRate: 19.999 })], 'Línea 1: el impuesto admite máximo 2 decimales')
  })

  it('descuento: tipo válido, no negativo y porcentaje hasta 100', () => {
    rejects([line({ discountValue: -1 })], 'Línea 1: el descuento no puede ser negativo')
    rejects([line({ discountValue: 101 })], 'Línea 1: el descuento no puede superar el 100%')
    rejects(
      [line({ discountType: 'otro' as unknown as 'percent' })],
      'Línea 1: el tipo de descuento es inválido',
    )
  })

  it('decimales de la moneda: solo 0, 1 o 2', () => {
    const msg = 'Los decimales de la moneda deben ser 0, 1 o 2'
    rejects([line()], msg, { pricesIncludeTax: false, currencyDecimals: 3 })
    rejects([line()], msg, { pricesIncludeTax: false, currencyDecimals: 1.5 })
    rejects([line()], msg, { pricesIncludeTax: false, currencyDecimals: -1 })
  })

  it('rechaza montos que no caben en la base de datos, sin lanzar errores', () => {
    rejects(
      [line({ quantity: 99_999_999, unitPrice: 999_999_999_999 })],
      'Línea 1: el monto supera el máximo permitido',
    )
    // cabe exacto…
    const max = calc([line({ unitPrice: 999_999_999_999.99, taxRate: 0 })], USD_NET)
    expect(max.totals.total).toBe(999_999_999_999.99)
    // …pero el impuesto lo saca del límite
    rejects(
      [line({ unitPrice: 999_999_999_999.99, taxRate: 19 })],
      'Línea 1: el monto supera el máximo permitido',
      USD_NET,
    )
  })

  it('rechaza el documento cuando la suma supera el máximo', () => {
    rejects(
      [line({ unitPrice: 600_000_000_000, taxRate: 0 }), line({ unitPrice: 600_000_000_000, taxRate: 0 })],
      'El total del documento supera el máximo permitido',
    )
  })
})

// Generador determinista (LCG): los mismos "azares" en cada corrida.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('calculateInvoice · propiedades sobre 600 documentos aleatorios', () => {
  it('los montos siempre cuadran, con o sin impuesto incluido y con 0, 1 o 2 decimales', () => {
    const rand = rng(2024)
    const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)]
    let checked = 0

    for (let n = 0; n < 600; n++) {
      const decimals = pick([0, 1, 2])
      const pricesIncludeTax = rand() < 0.5
      const lines: LineInput[] = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => {
        const percent = rand() < 0.5
        return {
          quantity: (1 + Math.floor(rand() * 50_000)) / 1000, // 0,001 – 50
          unitPrice: Math.floor(rand() * 500_000) / 100, // 0,00 – 5000,00
          discountType: percent ? 'percent' : 'amount',
          discountValue: percent
            ? Math.floor(rand() * 10_001) / 100 // 0,00 – 100,00 %
            : Math.floor(rand() * 2000) / 10 ** decimals, // monto en la moneda
          taxRate: pick([0, 5, 10, 10.5, 19]),
        }
      })

      const result = calculateInvoice(lines, { pricesIncludeTax, currencyDecimals: decimals })
      if (!result.ok) {
        // La única causa posible con estos datos: un descuento fijo mayor a la línea
        expect(result.error).toMatch(/el descuento supera el monto de la línea/)
        continue
      }
      checked++

      const minor = (v: number) => Math.round(v * 10 ** decimals)

      for (const l of result.lines) {
        expect(minor(l.total)).toBe(minor(l.net) + minor(l.tax))
        expect(l.discount).toBeLessThanOrEqual(l.gross)
        expect(minor(l.gross) - minor(l.discount)).toBe(pricesIncludeTax ? minor(l.total) : minor(l.net))
      }

      const sum = (pick: (l: LineTotals) => number) =>
        result.lines.reduce((acc, l) => acc + minor(pick(l)), 0)
      const t = result.totals
      expect(minor(t.subtotal)).toBe(sum((l) => l.net))
      expect(minor(t.taxTotal)).toBe(sum((l) => l.tax))
      expect(minor(t.discountTotal)).toBe(sum((l) => l.discount))
      expect(minor(t.total)).toBe(sum((l) => l.total))
      expect(minor(t.total)).toBe(minor(t.subtotal) + minor(t.taxTotal))

      expect(t.taxBreakdown.reduce((a, r) => a + minor(r.base), 0)).toBe(minor(t.subtotal))
      expect(t.taxBreakdown.reduce((a, r) => a + minor(r.tax), 0)).toBe(minor(t.taxTotal))
    }

    // La mayoría de los documentos generados deben ser válidos: si no, la prueba no probaría nada
    expect(checked).toBeGreaterThan(450)
  })
})

describe('toMoneyString', () => {
  it('formatea para numeric(14,2)', () => {
    expect(toMoneyString(1190)).toBe('1190.00')
    expect(toMoneyString(59.97)).toBe('59.97')
    expect(toMoneyString(0.3)).toBe('0.30')
  })
})
