import { calculateInvoice, type LineTotals } from './calculateInvoice'

// Precio del producto de ejemplo con el que se muestra el efecto de la configuración.
export const PREVIEW_PRICE = 10_000

export type PreviewInput = {
  pricesIncludeTax: boolean
  currencyDecimals: number
  taxRate: number
}

/** Una línea de ejemplo calculada con las mismas reglas que un documento real. Null si los datos aún no son válidos. */
export function buildPreview(input: PreviewInput): ({ price: number } & LineTotals) | null {
  const result = calculateInvoice(
    [{ quantity: 1, unitPrice: PREVIEW_PRICE, discountType: 'percent', discountValue: 0, taxRate: input.taxRate }],
    { pricesIncludeTax: input.pricesIncludeTax, currencyDecimals: input.currencyDecimals },
  )
  return result.ok ? { price: PREVIEW_PRICE, ...result.lines[0] } : null
}
