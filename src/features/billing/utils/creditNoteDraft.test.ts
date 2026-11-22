import { describe, expect, it } from 'vitest'
import type { CreditableItem, CreditContext } from '../types/invoice'
import { draftToLines, emptyDraft, fullDraft, parseQuantity, previewCreditNote } from './creditNoteDraft'

const none = { quantity: 0, gross: 0, discount: 0, net: 0, tax: 0, total: 0 }
const item = (over: Partial<CreditableItem> = {}): CreditableItem => ({
  itemId: 'i1', position: 1, productId: 'p1', sku: 'COLA', description: 'Cola 1L', unit: 'un', taxRate: 19, tracksStock: true,
  quantity: 3, creditedQuantity: 1, remainingQuantity: 2, lineTotal: 3570, creditedTotal: 1190, remainingTotal: 2380,
  source: {
    quantity: 3, taxRate: 19,
    original: { gross: 3570, discount: 0, net: 3000, tax: 570, total: 3570 },
    credited: { quantity: 1, gross: 1190, discount: 0, net: 1000, tax: 190, total: 1190 },
  },
  ...over,
})
const flete = item({
  itemId: 'i2', position: 2, productId: null, sku: null, description: 'Flete', tracksStock: false,
  quantity: 1, creditedQuantity: 0, remainingQuantity: 1, lineTotal: 1190, creditedTotal: 0, remainingTotal: 1190,
  source: { quantity: 1, taxRate: 19, original: { gross: 1190, discount: 0, net: 1000, tax: 190, total: 1190 }, credited: none },
})
const done = item({
  itemId: 'i3', position: 3, description: 'Bolsa', quantity: 1, creditedQuantity: 1, remainingQuantity: 0, lineTotal: 119, creditedTotal: 119, remainingTotal: 0,
  source: {
    quantity: 1, taxRate: 19,
    original: { gross: 119, discount: 0, net: 100, tax: 19, total: 119 },
    credited: { quantity: 1, gross: 119, discount: 0, net: 100, tax: 19, total: 119 },
  },
})
const context: CreditContext = {
  invoice: {
    id: 'inv-1', documentType: 'invoice', number: 12, currency: 'CLP', currencyDecimals: 0, taxName: 'IVA', pricesIncludeTax: true,
    total: 4879, creditTotal: 1309, paidTotal: 0, balance: 3570,
  },
  items: [item(), flete, done],
}

describe('parseQuantity', () => {
  it('acepta punto o coma y hasta 3 decimales', () => {
    expect(parseQuantity('2')).toBe(2)
    expect(parseQuantity(' 1,5 ')).toBe(1.5)
    expect(parseQuantity('0.125')).toBe(0.125)
  })
  it('vacío o cero: la línea no se acredita', () => {
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('   ')).toBeNull()
    expect(parseQuantity('0')).toBeNull()
    expect(parseQuantity('0,0')).toBeNull()
  })
  it('rechaza texto, negativos y más de 3 decimales', () => {
    for (const bad of ['abc', '-1', '1,2,3', '1.2345', '1e3', '٣']) {
      expect(parseQuantity(bad)).toEqual({ error: 'Escribe solo números, con hasta 3 decimales' })
    }
  })
})

describe('emptyDraft / fullDraft', () => {
  it('parte vacío, con "devolver al inventario" marcado solo en lo que controla stock', () => {
    expect(emptyDraft(context)).toEqual({
      i1: { quantity: '', restock: true },
      i2: { quantity: '', restock: false },
      i3: { quantity: '', restock: true },
    })
  })
  it('"todo" llena lo que queda y deja vacía la línea ya acreditada; respeta lo que se desmarcó', () => {
    const current = { ...emptyDraft(context), i1: { quantity: '', restock: false } }
    expect(fullDraft(context, current)).toEqual({
      i1: { quantity: '2', restock: false },
      i2: { quantity: '1', restock: false },
      i3: { quantity: '', restock: true },
    })
  })
})

describe('previewCreditNote', () => {
  it('sin cantidades no hay total ni errores', () => {
    expect(previewCreditNote(context, emptyDraft(context))).toEqual({
      lineErrors: {}, lineTotals: {}, totals: null, error: null, lineCount: 0, restockCount: 0,
    })
  })

  it('calcula con lo que quedaba de cada línea (igual que el servidor)', () => {
    const preview = previewCreditNote(context, { ...emptyDraft(context), i1: { quantity: '1', restock: true }, i2: { quantity: '1', restock: false } })
    expect(preview.lineTotals).toEqual({ i1: 1190, i2: 1190 })
    expect(preview.totals).toMatchObject({ subtotal: 2000, taxTotal: 380, total: 2380 })
    expect(preview.lineCount).toBe(2)
    expect(preview.restockCount).toBe(1) // el flete no controla stock
  })

  it('acreditar todo lo que queda de una línea toma el restante exacto', () => {
    const preview = previewCreditNote(context, { ...emptyDraft(context), i1: { quantity: '2', restock: true } })
    expect(preview.lineTotals.i1).toBe(2380)
  })

  it('"devolver al inventario" desmarcado no cuenta', () => {
    const preview = previewCreditNote(context, { ...emptyDraft(context), i1: { quantity: '1', restock: false } })
    expect(preview.restockCount).toBe(0)
  })

  it('marca la línea que se pasa de lo disponible y no la suma', () => {
    const preview = previewCreditNote(context, { ...emptyDraft(context), i1: { quantity: '3', restock: true }, i2: { quantity: '1', restock: false } })
    expect(preview.lineErrors).toEqual({ i1: 'Máximo 2 un' })
    expect(preview.totals?.total).toBe(1190) // solo el flete
  })

  it('texto inválido y línea ya acreditada por completo', () => {
    const preview = previewCreditNote(context, { ...emptyDraft(context), i1: { quantity: 'abc', restock: true }, i3: { quantity: '1', restock: true } })
    expect(preview.lineErrors).toEqual({
      i1: 'Escribe solo números, con hasta 3 decimales',
      i3: 'Esta línea ya está acreditada por completo',
    })
    expect(preview.totals).toBeNull()
  })

  it('decimales de cantidad', () => {
    const preview = previewCreditNote(context, { ...emptyDraft(context), i1: { quantity: '1,5', restock: true } })
    expect(preview.totals).toMatchObject({ subtotal: 1500, taxTotal: 285, total: 1785 })
  })
})

describe('draftToLines', () => {
  it('manda solo línea, cantidad y si vuelve al stock: nunca montos', () => {
    const draft = { ...emptyDraft(context), i1: { quantity: '1,5', restock: true }, i2: { quantity: '1', restock: true }, i3: { quantity: '', restock: true } }
    expect(draftToLines(context, draft)).toEqual([
      { itemId: 'i1', quantity: 1.5, restock: true },
      { itemId: 'i2', quantity: 1, restock: false }, // el flete no controla stock: nunca se devuelve
    ])
  })
  it('ignora líneas vacías o inválidas', () => {
    expect(draftToLines(context, { ...emptyDraft(context), i1: { quantity: 'x', restock: true } })).toEqual([])
  })
})
