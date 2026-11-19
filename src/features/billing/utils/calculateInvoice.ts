import {
  MAX_AMOUNT,
  MAX_INVOICE_LINES,
  MAX_QUANTITY,
  type DiscountType,
} from '../types/billing'

// Cálculo de montos de un documento. Función pura: el navegador la usa para mostrar el
// total en vivo y el servidor para el valor oficial (siempre con los precios de la base).
//
// Reglas (se documentan aquí porque son las que verá el cliente impresas):
// - Todo se opera en enteros: cantidad en milésimas, precio en centésimas, y los montos
//   en la unidad mínima de la moneda (pesos para CLP, centavos para USD). BigInt evita
//   desbordes con cantidades y precios grandes.
// - Cada línea se redondea por separado (mitad hacia arriba) y el documento es la SUMA
//   de líneas ya redondeadas: lo que se imprime en cada línea siempre cuadra con el total.
// - Precios con impuesto incluido: neto = total / (1 + tasa); impuesto = total − neto.
//   Precios sin impuesto: impuesto = neto × tasa; total = neto + impuesto.
// - El descuento se aplica sobre el monto de la línea, en la misma base de los precios
//   (con impuesto si el precio lo incluye) y antes de calcular el impuesto.

export type LineInput = {
  quantity: number
  unitPrice: number
  discountType: DiscountType
  discountValue: number
  taxRate: number // % ; 0 = exento
}

export type CalcOptions = {
  pricesIncludeTax: boolean
  currencyDecimals: number // 0–2
}

// Montos en unidades de la moneda (ej. 1190 o 59.97), ya redondeados.
export type LineTotals = {
  gross: number // cantidad × precio, antes de descuento
  discount: number
  net: number // sin impuesto
  tax: number
  total: number // net + tax
}

export type TaxBreakdownRow = { rate: number; base: number; tax: number }

export type InvoiceTotals = {
  subtotal: number // suma de netos (sin impuesto, con descuentos aplicados)
  discountTotal: number // suma de descuentos, en la base de los precios
  taxTotal: number
  total: number // subtotal + taxTotal
  taxBreakdown: TaxBreakdownRow[] // por tasa, de menor a mayor (incluye 0% si hay exentos)
}

export type CalcResult =
  | { ok: true; lines: LineTotals[]; totals: InvoiceTotals }
  | { ok: false; error: string }

// Un número con a lo sumo los decimales de `scale` → entero escalado (19.99 → 1999). Null si tiene más.
// toPrecision(15) absorbe el ruido de coma flotante (19.99 × 100 = 1998.9999999999998).
function scaled(value: number, scale: number): number | null {
  const n = Number((value * scale).toPrecision(15))
  return Number.isInteger(n) ? n : null
}

// Máximo que cabe en numeric(14,2), en unidades mínimas según los decimales de la moneda.
const MAX_MINOR = [999_999_999_999n, 9_999_999_999_999n, 99_999_999_999_999n] as const

// División entera con redondeo mitad hacia arriba (solo para valores ≥ 0).
const roundDiv = (n: bigint, d: bigint) => (2n * n + d) / (2n * d)

function validateLine(line: LineInput, decimals: number): string | null {
  const { quantity, unitPrice, discountType, discountValue, taxRate } = line

  if (!Number.isFinite(quantity) || quantity <= 0) return 'la cantidad debe ser mayor a 0'
  if (quantity > MAX_QUANTITY) return 'la cantidad es demasiado grande'
  if (scaled(quantity, 1000) === null) return 'la cantidad admite máximo 3 decimales'

  if (!Number.isFinite(unitPrice) || unitPrice < 0) return 'el precio no puede ser negativo'
  if (unitPrice > MAX_AMOUNT) return 'el precio es demasiado grande'
  if (scaled(unitPrice, 100) === null) return 'el precio admite máximo 2 decimales'

  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return 'el impuesto debe estar entre 0% y 100%'
  }
  if (scaled(taxRate, 100) === null) return 'el impuesto admite máximo 2 decimales'

  if (discountType !== 'percent' && discountType !== 'amount') return 'el tipo de descuento es inválido'
  if (!Number.isFinite(discountValue) || discountValue < 0) return 'el descuento no puede ser negativo'
  if (discountType === 'percent') {
    if (discountValue > 100) return 'el descuento no puede superar el 100%'
    if (scaled(discountValue, 100) === null) return 'el descuento admite máximo 2 decimales'
  } else {
    if (discountValue > MAX_AMOUNT) return 'el descuento es demasiado grande'
    if (scaled(discountValue, 10 ** decimals) === null) {
      return decimals === 0
        ? 'el descuento debe ser un monto entero'
        : `el descuento admite máximo ${decimals} decimales`
    }
  }
  return null
}

export function calculateInvoice(lines: LineInput[], options: CalcOptions): CalcResult {
  const { pricesIncludeTax, currencyDecimals: d } = options

  if (!Number.isInteger(d) || d < 0 || d > 2) {
    return { ok: false, error: 'Los decimales de la moneda deben ser 0, 1 o 2' }
  }
  if (lines.length === 0) return { ok: false, error: 'Agrega al menos un producto' }
  if (lines.length > MAX_INVOICE_LINES) {
    return { ok: false, error: `Máximo ${MAX_INVOICE_LINES} líneas por documento` }
  }

  const max = MAX_MINOR[d]
  const toMajor = (minor: bigint) => Number(minor) / 10 ** d

  const results: { gross: bigint; discount: bigint; net: bigint; tax: bigint; total: bigint }[] = []
  const byRate = new Map<number, { base: bigint; tax: bigint }>()

  for (const [i, line] of lines.entries()) {
    const at = `Línea ${i + 1}: `
    const problem = validateLine(line, d)
    if (problem) return { ok: false, error: at + problem }

    const quantity = BigInt(scaled(line.quantity, 1000)!) // milésimas
    const price = BigInt(scaled(line.unitPrice, 100)!) // centésimas
    const rate = BigInt(scaled(line.taxRate, 100)!) // centésimas de %

    // milésimas × centésimas = cienmilésimas de unidad; la unidad mínima vale 10^(5−d) de ellas
    const gross = roundDiv(quantity * price, 10n ** BigInt(5 - d))

    const discount =
      line.discountType === 'percent'
        ? roundDiv(gross * BigInt(scaled(line.discountValue, 100)!), 10_000n)
        : BigInt(scaled(line.discountValue, 10 ** d)!)
    if (discount > gross) return { ok: false, error: at + 'el descuento supera el monto de la línea' }

    const afterDiscount = gross - discount
    let net: bigint
    let tax: bigint
    let total: bigint
    if (pricesIncludeTax) {
      total = afterDiscount
      net = roundDiv(afterDiscount * 10_000n, 10_000n + rate)
      tax = total - net
    } else {
      net = afterDiscount
      tax = roundDiv(net * rate, 10_000n)
      total = net + tax
    }

    if (gross > max || total > max) {
      return { ok: false, error: at + 'el monto supera el máximo permitido' }
    }

    results.push({ gross, discount, net, tax, total })
    const row = byRate.get(Number(rate)) ?? { base: 0n, tax: 0n }
    byRate.set(Number(rate), { base: row.base + net, tax: row.tax + tax })
  }

  const sum = (pick: (r: (typeof results)[number]) => bigint) =>
    results.reduce((acc, r) => acc + pick(r), 0n)
  const subtotal = sum((r) => r.net)
  const discountTotal = sum((r) => r.discount)
  const taxTotal = sum((r) => r.tax)
  const total = subtotal + taxTotal

  if (total > max || subtotal > max || discountTotal > max || taxTotal > max) {
    return { ok: false, error: 'El total del documento supera el máximo permitido' }
  }

  return {
    ok: true,
    lines: results.map((r) => ({
      gross: toMajor(r.gross),
      discount: toMajor(r.discount),
      net: toMajor(r.net),
      tax: toMajor(r.tax),
      total: toMajor(r.total),
    })),
    totals: {
      subtotal: toMajor(subtotal),
      discountTotal: toMajor(discountTotal),
      taxTotal: toMajor(taxTotal),
      total: toMajor(total),
      taxBreakdown: [...byRate.entries()]
        .sort(([a], [b]) => a - b)
        .map(([rate, row]) => ({ rate: rate / 100, base: toMajor(row.base), tax: toMajor(row.tax) })),
    },
  }
}

/** Monto → texto para una columna numeric(14,2): 1190 → "1190.00". */
export const toMoneyString = (value: number) => value.toFixed(2)
