import type { IssueInvoiceInput } from '../schemas/invoiceSchema'
import type { BillingSettings, DiscountType, DocumentType, PaymentMethod } from '../types/billing'
import type { ProductOption, StockShortage } from '../types/invoice'
import { calculateInvoice, type CalcResult, type LineInput } from './calculateInvoice'
import { planStockDeductions } from './stockPlan'

// El borrador de una factura mientras se arma en pantalla. Todo lo que la persona escribe se guarda
// como TEXTO ("1,5", "", "1."): así un campo se puede vaciar o dejar a medias sin que el número salte.
// Se convierte a número solo al calcular o enviar. Lógica pura, sin React: se prueba por separado.

export type DraftLine = {
  key: string // identificador estable para React; no viaja al servidor
  productId: string | null // null = concepto libre (servicio, flete…)
  sku: string | null
  description: string
  unit: string
  unitPrice: string // de un producto es el del catálogo (solo lectura); de un concepto libre lo escribe la persona
  quantity: string
  discountType: DiscountType
  discountValue: string // '' = sin descuento
  taxRate: string | null // null = la que le corresponde (la de su producto o la de la empresa)
  productTaxRate: number | null // la tasa propia del producto (0 = exento); null si no tiene o es un concepto libre
  trackStock: boolean
  stock: number | null // el que tenía al elegirlo; solo para avisar, el servidor vuelve a comprobarlo
}

export type DraftSettings = Pick<
  BillingSettings,
  'pricesIncludeTax' | 'currencyDecimals' | 'taxRate' | 'allowNegativeStock'
>

type EditableField = 'description' | 'unit' | 'unitPrice' | 'quantity' | 'discountType' | 'discountValue' | 'taxRate'

export type DraftAction =
  | { type: 'add-product'; product: ProductOption; key: string }
  | { type: 'add-free'; key: string }
  | { type: 'update'; key: string; patch: Partial<Pick<DraftLine, EditableField>> }
  | { type: 'remove'; key: string }
  | { type: 'clear' }

/** "1,5", "1.5", "2", "1." y ",5" son números; cualquier otra cosa (vacío, "abc", "1e3", "-1") es NaN. */
export function parseDecimal(text: string): number {
  const value = text.trim()
  if (!/^(\d+[.,]?\d*|[.,]\d+)$/.test(value)) return NaN
  return Number(value.replace(',', '.'))
}

/** Suma 1 a una cantidad escrita como texto, conservando sus decimales ("1,5" → "2.5"). */
function increment(quantity: string): string {
  const current = parseDecimal(quantity)
  const next = (Number.isFinite(current) ? Math.round(current * 1000) : 0) + 1000
  return String(next / 1000)
}

export function draftReducer(lines: DraftLine[], action: DraftAction): DraftLine[] {
  switch (action.type) {
    case 'add-product': {
      // Elegir dos veces el mismo producto (p. ej. escanearlo) suma una unidad en vez de duplicar la línea
      const existing = lines.find((line) => line.productId === action.product.id)
      if (existing) {
        return lines.map((line) => (line === existing ? { ...line, quantity: increment(line.quantity) } : line))
      }
      const { product } = action
      return [
        ...lines,
        {
          key: action.key,
          productId: product.id,
          sku: product.sku,
          description: product.name,
          unit: product.unit,
          unitPrice: String(product.price),
          quantity: '1',
          discountType: 'percent',
          discountValue: '',
          taxRate: null,
          productTaxRate: product.taxRate,
          trackStock: product.trackStock,
          stock: product.stock,
        },
      ]
    }
    case 'add-free':
      return [
        ...lines,
        {
          key: action.key,
          productId: null,
          sku: null,
          description: '',
          unit: 'un',
          unitPrice: '',
          quantity: '1',
          discountType: 'percent',
          discountValue: '',
          taxRate: null,
          productTaxRate: null,
          trackStock: false,
          stock: null,
        },
      ]
    case 'update':
      return lines.map((line) => (line.key === action.key ? { ...line, ...action.patch } : line))
    case 'remove':
      return lines.filter((line) => line.key !== action.key)
    case 'clear':
      return []
  }
}

/** Las líneas del borrador convertidas a números para calculateInvoice. Lo vacío o inválido llega como NaN y se rechaza allí. */
export function toCalcLines(lines: DraftLine[], settings: Pick<DraftSettings, 'taxRate'>): LineInput[] {
  return lines.map((line) => ({
    quantity: parseDecimal(line.quantity),
    unitPrice: parseDecimal(line.unitPrice),
    discountType: line.discountType,
    discountValue: line.discountValue.trim() === '' ? 0 : parseDecimal(line.discountValue),
    taxRate: line.taxRate === null ? (line.productTaxRate ?? settings.taxRate) : parseDecimal(line.taxRate),
  }))
}

/** Totales en vivo, con las mismas reglas con que el servidor calculará el documento. */
export function computeDraft(lines: DraftLine[], settings: DraftSettings): CalcResult {
  return calculateInvoice(toCalcLines(lines, settings), {
    pricesIncludeTax: settings.pricesIncludeTax,
    currencyDecimals: settings.currencyDecimals,
  })
}

/**
 * Productos del borrador a los que no les alcanza el stock (por id de producto). Un producto repetido
 * se suma. Solo avisa: el servidor decide al emitir, con el stock real en ese momento.
 */
export function stockShortages(lines: DraftLine[], allowNegativeStock: boolean): Map<string, StockShortage> {
  const requests = []
  const stock = new Map<string, number>()
  for (const line of lines) {
    const quantity = parseDecimal(line.quantity)
    if (!line.trackStock || !line.productId || line.stock === null || !(quantity > 0)) continue
    requests.push({ productId: line.productId, name: line.description, unit: line.unit, quantity })
    stock.set(line.productId, line.stock)
  }
  const plan = planStockDeductions(requests, stock, allowNegativeStock)
  return new Map(plan.ok ? [] : plan.shortages.map((shortage) => [shortage.productId, shortage]))
}

export type DraftMeta = {
  documentType: DocumentType
  customerId: string | null
  dueDate: string // '' = el plazo por defecto de la empresa
  notes: string
  paid: boolean
  paymentMethod: PaymentMethod // solo viaja si se cobra al emitir
  idempotencyKey: string
}

/**
 * La solicitud que se envía al servidor. De un producto del catálogo solo viaja su id, la cantidad,
 * el descuento y el impuesto: nombre, unidad y precio los toma el servidor de la base de datos.
 */
export function toIssueInput(lines: DraftLine[], meta: DraftMeta): IssueInvoiceInput {
  return {
    documentType: meta.documentType,
    customerId: meta.customerId,
    dueDate: meta.dueDate.trim() === '' ? null : meta.dueDate,
    notes: meta.notes,
    paid: meta.paid,
    paymentMethod: meta.paid ? meta.paymentMethod : undefined,
    idempotencyKey: meta.idempotencyKey,
    lines: lines.map((line) => ({
      productId: line.productId,
      description: line.productId ? '' : line.description.trim(),
      unit: line.productId ? '' : line.unit.trim(),
      quantity: parseDecimal(line.quantity),
      unitPrice: line.productId ? 0 : parseDecimal(line.unitPrice),
      discountType: line.discountType,
      discountValue: line.discountValue.trim() === '' ? 0 : parseDecimal(line.discountValue),
      taxRate: line.taxRate === null ? null : parseDecimal(line.taxRate),
    })),
  }
}
