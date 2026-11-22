import { formatQuantity, toMilli } from '@/features/inventory/utils/stockMath'
import type { CreditContext } from '../types/invoice'
import type { InvoiceTotals } from './calculateInvoice'
import { calculateCreditNote, type CreditLineRequest } from './calculateCreditNote'
import { planRestock } from './creditNoteStock'

// Lógica de la pantalla "Crear nota de crédito", sin React: qué escribió la persona, qué errores tiene cada
// línea y cuánto sumaría la nota. El total que se muestra sale de calculateCreditNote, la misma función
// que usa el servidor, así que lo que se ve es lo que se emite.

export type DraftLine = { quantity: string; restock: boolean }
export type CreditDraft = Record<string, DraftLine> // por id de línea original

export type CreditPreview = {
  lineErrors: Record<string, string>
  lineTotals: Record<string, number> // lo que acredita cada línea válida
  totals: InvoiceTotals | null // null si no hay ninguna línea válida
  error: string | null // error general (por ejemplo, total 0); los de línea van en lineErrors
  lineCount: number // líneas válidas
  restockCount: number // líneas válidas cuyas unidades vuelven al inventario
}

/** Una línea vacía por cada línea original; "devolver al inventario" viene marcado si la línea controla stock. */
export function emptyDraft(context: CreditContext): CreditDraft {
  return Object.fromEntries(context.items.map((item) => [item.itemId, { quantity: '', restock: item.tracksStock }]))
}

/** Todo lo que queda por acreditar, línea por línea. */
export function fullDraft(context: CreditContext, current: CreditDraft): CreditDraft {
  return Object.fromEntries(
    context.items.map((item) => [
      item.itemId,
      {
        quantity: item.remainingQuantity > 0 ? String(item.remainingQuantity) : '',
        restock: current[item.itemId]?.restock ?? item.tracksStock,
      },
    ]),
  )
}

/** "1,5" y "1.5" valen lo mismo. Vacío o cero: la línea no se acredita (null). */
export function parseQuantity(text: string): number | null | { error: string } {
  const clean = text.trim().replace(',', '.')
  if (clean === '') return null
  if (!/^\d+(\.\d{1,3})?$/.test(clean)) return { error: 'Escribe solo números, con hasta 3 decimales' }
  const value = Number(clean)
  return value === 0 ? null : value
}

export function previewCreditNote(context: CreditContext, draft: CreditDraft): CreditPreview {
  const lineErrors: Record<string, string> = {}
  const requests: (CreditLineRequest & { itemId: string })[] = []

  for (const item of context.items) {
    const line = draft[item.itemId]
    if (!line) continue
    const parsed = parseQuantity(line.quantity)
    if (parsed === null) continue
    if (typeof parsed === 'object') {
      lineErrors[item.itemId] = parsed.error
    } else if (toMilli(parsed) > toMilli(item.remainingQuantity)) {
      lineErrors[item.itemId] =
        item.remainingQuantity > 0
          ? `Máximo ${formatQuantity(toMilli(item.remainingQuantity))} ${item.unit}`
          : 'Esta línea ya está acreditada por completo'
    } else {
      requests.push({ itemId: item.itemId, source: item.source, quantity: parsed })
    }
  }

  if (requests.length === 0) {
    return { lineErrors, lineTotals: {}, totals: null, error: null, lineCount: 0, restockCount: 0 }
  }

  const result = calculateCreditNote(requests, { currencyDecimals: context.invoice.currencyDecimals })
  if (!result.ok) {
    return {
      lineErrors,
      lineTotals: {},
      totals: null,
      error: result.error,
      lineCount: requests.length,
      restockCount: 0,
    }
  }

  const lineTotals = Object.fromEntries(requests.map((request, index) => [request.itemId, result.lines[index].total]))
  const byId = new Map(context.items.map((item) => [item.itemId, item]))
  const restockCount = planRestock(
    requests.map((request) => ({
      productId: byId.get(request.itemId)!.productId,
      quantity: request.quantity,
      tracksStock: byId.get(request.itemId)!.tracksStock,
      restock: draft[request.itemId].restock,
    })),
  ).length

  return { lineErrors, lineTotals, totals: result.totals, error: null, lineCount: requests.length, restockCount }
}

/** Lo que se manda al servidor: solo línea, cantidad y si vuelve al stock. Nunca montos. */
export function draftToLines(context: CreditContext, draft: CreditDraft) {
  return context.items.flatMap((item) => {
    const parsed = parseQuantity(draft[item.itemId]?.quantity ?? '')
    if (parsed === null || typeof parsed === 'object') return []
    return [{ itemId: item.itemId, quantity: parsed, restock: item.tracksStock && draft[item.itemId].restock }]
  })
}
