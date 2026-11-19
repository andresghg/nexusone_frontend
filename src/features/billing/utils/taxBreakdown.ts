import type { TaxBreakdownRow } from './calculateInvoice'
import type { InvoiceDetailItem } from '../types/invoice'
import { fromMinorUnits, toMinorUnits } from './minorUnits'

/** Base e impuesto por tasa, a partir de las líneas ya emitidas (de menor a mayor tasa). Suma en enteros. */
export function taxBreakdownOf(
  items: Pick<InvoiceDetailItem, 'taxRate' | 'lineNet' | 'lineTax'>[],
  decimals: number,
): TaxBreakdownRow[] {
  const byRate = new Map<number, { base: number; tax: number }>()
  for (const item of items) {
    const row = byRate.get(item.taxRate) ?? { base: 0, tax: 0 }
    byRate.set(item.taxRate, {
      base: row.base + (toMinorUnits(item.lineNet, decimals) ?? 0),
      tax: row.tax + (toMinorUnits(item.lineTax, decimals) ?? 0),
    })
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, row]) => ({ rate, base: fromMinorUnits(row.base, decimals), tax: fromMinorUnits(row.tax, decimals) }))
}
