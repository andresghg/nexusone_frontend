import { MAX_INVOICE_LINES } from '../types/billing'
import type { InvoiceTotals, LineTotals } from './calculateInvoice'

// Cálculo de una nota de crédito. Función pura (como calculateInvoice): el navegador la usa para el total
// en vivo y el servidor para el valor oficial, siempre con los datos de la base.
//
// Reglas:
// - Una nota acredita líneas del documento original. NUNCA recalcula con el precio o la tasa de hoy: reparte
//   los montos que quedaban por acreditar de esa línea (monto original − lo ya acreditado por otras notas).
// - Reparto proporcional a la cantidad: neto, impuesto, bruto y descuento = restante × cantidad / cantidad
//   restante, redondeado mitad hacia arriba; total = neto + impuesto (como en el documento original).
// - Si la nota acredita TODO lo que quedaba de la línea, toma el restante exacto: así la suma de todas las
//   notas de una línea es igual al original, sin sobras ni faltantes por redondeo.
// - Como cada reparto es ≤ lo que quedaba, es imposible acreditar de más (la base lo vuelve a verificar).
// - Todo se opera en enteros (cantidad en milésimas, montos en la unidad mínima de la moneda) con BigInt.

export type CreditSourceLine = {
  quantity: number // cantidad facturada en la línea original
  taxRate: number // % de la línea original (solo para el desglose por tasa)
  original: LineTotals // montos de la línea original
  credited: LineTotals & { quantity: number } // lo ya acreditado por notas emitidas
}

export type CreditLineRequest = { source: CreditSourceLine; quantity: number }

export type CreditNoteLine = LineTotals & {
  taxRate: number
  closesLine: boolean // true si con esta nota la línea queda totalmente acreditada
}

export type CreditCalcResult =
  | { ok: true; lines: CreditNoteLine[]; totals: InvoiceTotals }
  | { ok: false; error: string }

const roundDiv = (n: bigint, d: bigint) => (2n * n + d) / (2n * d)

// Número con a lo sumo los decimales de `scale` → entero escalado. Null si tiene más.
function scaled(value: number, scale: number): number | null {
  const n = Number((value * scale).toPrecision(15))
  return Number.isInteger(n) ? n : null
}

const formatQty = (milli: bigint) => String(Number(milli) / 1000)

export function calculateCreditNote(
  requests: CreditLineRequest[],
  options: { currencyDecimals: number },
): CreditCalcResult {
  const d = options.currencyDecimals
  if (!Number.isInteger(d) || d < 0 || d > 2) {
    return { ok: false, error: 'Los decimales de la moneda deben ser 0, 1 o 2' }
  }
  if (requests.length === 0) return { ok: false, error: 'Elige al menos una línea para acreditar' }
  if (requests.length > MAX_INVOICE_LINES) {
    return { ok: false, error: `Máximo ${MAX_INVOICE_LINES} líneas por documento` }
  }

  const factor = 10 ** d
  const minor = (value: number) => BigInt(Math.round(Number((value * factor).toPrecision(15))))
  const toMajor = (value: bigint) => Number(value) / factor

  const lines: { net: bigint; tax: bigint; gross: bigint; discount: bigint; total: bigint; rate: number; closes: boolean }[] = []

  for (const [i, { source, quantity }] of requests.entries()) {
    const at = `Línea ${i + 1}: `

    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: at + 'la cantidad debe ser mayor a 0' }
    const q = scaled(quantity, 1000)
    if (q === null) return { ok: false, error: at + 'la cantidad admite máximo 3 decimales' }

    const remainingQty = BigInt(scaled(source.quantity, 1000)!) - BigInt(scaled(source.credited.quantity, 1000)!)
    if (remainingQty <= 0n) return { ok: false, error: at + 'ya está acreditada por completo' }
    if (BigInt(q) > remainingQty) {
      return { ok: false, error: at + `solo quedan ${formatQty(remainingQty)} por acreditar` }
    }

    const rem = {
      gross: minor(source.original.gross) - minor(source.credited.gross),
      discount: minor(source.original.discount) - minor(source.credited.discount),
      net: minor(source.original.net) - minor(source.credited.net),
      tax: minor(source.original.tax) - minor(source.credited.tax),
    }
    if (rem.gross < 0n || rem.discount < 0n || rem.net < 0n || rem.tax < 0n) {
      return { ok: false, error: at + 'lo acreditado supera lo facturado: los datos de la línea son inconsistentes' }
    }

    const closes = BigInt(q) === remainingQty
    const share = (amount: bigint) => (closes ? amount : roundDiv(amount * BigInt(q), remainingQty))
    const gross = share(rem.gross)
    const net = share(rem.net)
    const tax = share(rem.tax)
    // Restricción de la base: el descuento de una línea nunca supera su bruto.
    const discount = (() => {
      const value = share(rem.discount)
      return value > gross ? gross : value
    })()

    lines.push({ gross, discount, net, tax, total: net + tax, rate: Math.round(source.taxRate * 100), closes })
  }

  const sum = (pick: (l: (typeof lines)[number]) => bigint) => lines.reduce((acc, l) => acc + pick(l), 0n)
  const subtotal = sum((l) => l.net)
  const taxTotal = sum((l) => l.tax)
  const total = subtotal + taxTotal
  if (total <= 0n) return { ok: false, error: 'El total de la nota de crédito debe ser mayor a 0' }

  const byRate = new Map<number, { base: bigint; tax: bigint }>()
  for (const l of lines) {
    const row = byRate.get(l.rate) ?? { base: 0n, tax: 0n }
    byRate.set(l.rate, { base: row.base + l.net, tax: row.tax + l.tax })
  }

  return {
    ok: true,
    lines: lines.map((l, i) => ({
      gross: toMajor(l.gross),
      discount: toMajor(l.discount),
      net: toMajor(l.net),
      tax: toMajor(l.tax),
      total: toMajor(l.total),
      taxRate: requests[i].source.taxRate,
      closesLine: l.closes,
    })),
    totals: {
      subtotal: toMajor(subtotal),
      discountTotal: toMajor(sum((l) => l.discount)),
      taxTotal: toMajor(taxTotal),
      total: toMajor(total),
      taxBreakdown: [...byRate.entries()]
        .sort(([a], [b]) => a - b)
        .map(([rate, row]) => ({ rate: rate / 100, base: toMajor(row.base), tax: toMajor(row.tax) })),
    },
  }
}
