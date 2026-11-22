import {
  accessService,
  type IAccessResolver,
} from '@/features/organization/services/AccessService'
import {
  customerRepository,
  type ICustomerRepository,
} from '@/features/customers/services/CustomerRepository'
import { formatQuantity } from '@/features/inventory/utils/stockMath'
import {
  AddPaymentSchema,
  IssueCreditNoteSchema,
  IssueInvoiceSchema,
  VoidInvoiceSchema,
  VoidPaymentSchema,
  type AddPaymentInput,
  type IssueCreditNoteInput,
  type IssueInvoiceInput,
  type VoidInvoiceInput,
  type VoidPaymentInput,
} from '../schemas/invoiceSchema'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '../types/billing'
import type {
  CreditContext,
  CustomerSnapshot,
  InvoiceDetail,
  InvoiceListDisplay,
  InvoiceListFilters,
  InvoicePage,
  IssueCommand,
  IssueCreditNoteCommand,
  IssuedCreditNote,
  IssuedInvoice,
  IssueLineCommand,
  ProductOption,
  StockShortage,
} from '../types/invoice'
import { calculateInvoice } from '../utils/calculateInvoice'
import { addDays, todayInTimezone } from '../utils/dates'
import { formatDocumentNumber } from '../utils/documentNumber'
import { formatMoney } from '../utils/formatMoney'
import { resolvePeriod } from '../utils/periods'
import {
  billingSettingsRepository,
  type IBillingSettingsRepository,
} from './BillingSettingsRepository'
import { invoiceRepository, type IInvoiceRepository, type Pagination } from './InvoiceRepository'

export type IssueResponse = { error: string; success: string; invoice?: IssuedInvoice }
export type CreditNoteResponse = { error: string; success: string; creditNote?: IssuedCreditNote }

const fail = (error: string) => ({ error, success: '' })

export const PRODUCT_SEARCH_LIMIT = 20

export const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

// La página viene de la URL: se normaliza para que nadie pida 10 millones de filas o la página NaN.
const toInt = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.floor(value as number) : fallback

const displayOf = (settings: BillingSettings): InvoiceListDisplay => ({
  locale: settings.locale,
  timezone: settings.timezone,
  documentPrefixes: settings.documentPrefixes,
})

// "Línea 1: el producto ya no existe" → el mismo formato de numeración que usa calculateInvoice
const at = (index: number) => `Línea ${index + 1}: `

function shortageMessage(shortages: StockShortage[]) {
  const detail = shortages.map(
    (s) =>
      `${s.name} (disponible ${formatQuantity(Math.max(0, s.available))} ${s.unit}, pedido ${formatQuantity(s.requested)} ${s.unit})`,
  )
  return `Stock insuficiente: ${detail.join('; ')}`
}

export class InvoiceService {
  constructor(
    private invoices: IInvoiceRepository,
    private settings: IBillingSettingsRepository,
    private customers: ICustomerRepository,
    private access: IAccessResolver,
    private now: () => Date = () => new Date(),
  ) {}

  /** Documentos emitidos y anulados de la empresa. Sin permiso de lectura devuelve la lista vacía. */
  async list(
    userId: string,
    organizationId: string,
    filters: InvoiceListFilters = {},
    pagination: Partial<Pagination> = {},
  ): Promise<InvoicePage> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.read')
    if (!access) return { rows: [], total: 0, display: displayOf(DEFAULT_BILLING_SETTINGS) }

    const settings = await this.loadSettings(access.organizationId)
    // Los períodos ("hoy", "este mes") y lo "vencido" dependen del día de la empresa, no del servidor
    const today = todayInTimezone(this.now(), settings.timezone)
    const { period, ...rest } = filters

    const page = await this.invoices.findPage(
      access.organizationId,
      {
        ...rest,
        ...resolvePeriod(period ?? 'all', today),
        timezone: settings.timezone,
        today,
        documentPrefixes: settings.documentPrefixes,
      },
      {
        page: Math.max(1, toInt(pagination.page, 1)),
        pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(pagination.pageSize, DEFAULT_PAGE_SIZE))),
      },
    )
    return { ...page, display: displayOf(settings) }
  }

  /** Un documento con sus líneas y pagos, más cómo mostrarlo. Sin permiso de lectura o si no existe: null. */
  async getDetail(
    userId: string,
    organizationId: string,
    invoiceId: string,
  ): Promise<{ detail: InvoiceDetail; display: InvoiceListDisplay } | null> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.read')
    if (!access) return null

    const settings = await this.loadSettings(access.organizationId)
    const today = todayInTimezone(this.now(), settings.timezone)
    const detail = await this.invoices.findDetail(access.organizationId, invoiceId, today)
    return detail ? { detail, display: displayOf(settings) } : null
  }

  /** Registra un cobro (completo o parcial). Quien puede emitir documentos puede cobrarlos. */
  async addPayment(userId: string, organizationId: string, input: AddPaymentInput): Promise<IssueResponse> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.create')
    if (!access) return fail('No tienes permisos para registrar cobros')

    const parsed = AddPaymentSchema.safeParse(input)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const data = parsed.data

    const settings = await this.loadSettings(access.organizationId)
    const outcome = await this.invoices.addPayment(access.organizationId, {
      userId,
      invoiceId: data.invoiceId,
      amount: data.amount,
      method: data.method,
      reference: data.reference || null,
      paidAt: this.now(),
    })

    const money = (value: number, currency: string, decimals: number) =>
      formatMoney(value, { currency, locale: settings.locale, decimals })

    switch (outcome.status) {
      case 'added':
        return {
          error: '',
          success:
            outcome.paymentStatus === 'paid'
              ? 'Cobro registrado: el documento quedó pagado'
              : `Cobro registrado. Saldo pendiente: ${money(outcome.balance, outcome.currency, outcome.currencyDecimals)}`,
        }
      case 'not_found':
        return fail('El documento no existe')
      case 'not_issued':
        return fail(outcome.current === 'void' ? 'El documento está anulado' : 'Solo se pueden cobrar documentos emitidos')
      case 'settled':
        return fail('El documento ya está pagado')
      case 'credit_note':
        return fail('Una nota de crédito no recibe cobros')
      case 'exceeds_balance':
        return fail(
          `El monto supera el saldo pendiente (${money(outcome.balance, outcome.currency, outcome.currencyDecimals)})`,
        )
      case 'invalid_amount':
        return fail(
          outcome.currencyDecimals === 0
            ? 'El monto debe ser un número entero'
            : `El monto admite máximo ${outcome.currencyDecimals} decimales`,
        )
    }
  }

  /** Anula un cobro. Como anular un documento, queda reservado a quien tiene ese permiso. */
  async voidPayment(userId: string, organizationId: string, input: VoidPaymentInput): Promise<IssueResponse> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.void')
    if (!access) return fail('No tienes permisos para anular cobros')

    const parsed = VoidPaymentSchema.safeParse(input)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos')

    const outcome = await this.invoices.voidPayment(access.organizationId, {
      userId,
      paymentId: parsed.data.paymentId,
      reason: parsed.data.reason,
      voidedAt: this.now(),
    })

    switch (outcome.status) {
      case 'voided':
        return { error: '', success: 'Cobro anulado' }
      case 'not_found':
        return fail('El cobro no existe')
      case 'already_voided':
        return fail('El cobro ya está anulado')
      case 'not_issued':
        return fail('El documento está anulado')
    }
  }

  /** Productos activos que coinciden con lo escrito (nombre, SKU o código de barras). Sin permiso: lista vacía. */
  async searchProducts(userId: string, organizationId: string, term: string): Promise<ProductOption[]> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.create')
    if (!access) return []
    return this.invoices.searchProducts(access.organizationId, term.trim().slice(0, 100), PRODUCT_SEARCH_LIMIT)
  }

  async issue(userId: string, organizationId: string, input: IssueInvoiceInput): Promise<IssueResponse> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.create')
    if (!access) return fail('No tienes permisos para emitir documentos')
    const orgId = access.organizationId

    // Defensa en profundidad: la acción ya valida con este mismo schema
    const parsed = IssueInvoiceSchema.safeParse(input)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const data = parsed.data

    // Reintento o doble clic: se devuelve el documento ya emitido en lugar de crear otro
    const replay = await this.invoices.findByIdempotencyKey(orgId, data.idempotencyKey)
    if (replay) return this.issued(replay, (await this.loadSettings(orgId)).documentPrefixes)

    const settings = await this.loadSettings(orgId)

    // Descuentos e impuesto por línea mueven el precio final: solo quien tiene permiso de ajuste puede
    // usarlos. La pantalla ni los ofrece al resto; esto cubre una petición manipulada.
    const canAdjust = access.permissions.includes('pos.facturacion.adjust')
    if (!canAdjust) {
      for (const [index, line] of data.lines.entries()) {
        if (line.discountValue !== 0) return fail(at(index) + 'no tienes permisos para aplicar descuentos')
      }
    }

    // Precio, nombre, unidad y control de stock salen de la base de datos: lo que diga el navegador no cuenta
    const productIds = [...new Set(data.lines.flatMap((l) => (l.productId ? [l.productId] : [])))]
    const found = await this.invoices.findProducts(orgId, productIds)
    const byId = new Map(found.map((product) => [product.id, product]))

    const drafts = []
    for (const [index, line] of data.lines.entries()) {
      if (line.productId) {
        const product = byId.get(line.productId)
        if (!product) return fail(at(index) + 'el producto ya no existe')
        if (!product.active) return fail(at(index) + `"${product.name}" está archivado y no se puede facturar`)
        drafts.push({
          line,
          productId: product.id,
          sku: product.sku,
          description: product.name,
          unit: product.unit,
          unitPrice: product.price,
          // La tasa de la línea es la del producto (0 = exento); si no tiene una propia, la de la empresa
          defaultTaxRate: product.taxRate ?? settings.taxRate,
          productTaxRate: product.taxRate,
          tracksStock: product.trackStock,
        })
      } else {
        drafts.push({
          line,
          productId: null,
          sku: null,
          description: line.description,
          unit: line.unit || 'un',
          unitPrice: line.unitPrice,
          defaultTaxRate: settings.taxRate,
          productTaxRate: null,
          tracksStock: false,
        })
      }
    }

    // Sin permiso de ajuste, la tasa de cada línea es la que le corresponde (la de su producto o la de la
    // empresa): no se puede dejar una línea exenta ni cambiarle el impuesto
    if (!canAdjust) {
      for (const [index, draft] of drafts.entries()) {
        if (draft.line.taxRate !== null && draft.line.taxRate !== draft.defaultTaxRate) {
          return fail(at(index) + 'no tienes permisos para cambiar el impuesto')
        }
      }
    }

    const calc = calculateInvoice(
      drafts.map((d) => ({
        quantity: d.line.quantity,
        unitPrice: d.unitPrice,
        discountType: d.line.discountType,
        discountValue: d.line.discountValue,
        taxRate: d.line.taxRate ?? d.defaultTaxRate,
      })),
      { pricesIncludeTax: settings.pricesIncludeTax, currencyDecimals: settings.currencyDecimals },
    )
    if (!calc.ok) return fail(calc.error)

    let customer: CustomerSnapshot | null = null
    if (data.customerId) {
      const row = await this.customers.findById(orgId, data.customerId)
      if (!row) return fail('El cliente no existe')
      if (!row.active) return fail('El cliente está archivado')
      customer = { id: row.id, name: row.name, taxId: row.taxId, email: row.email, address: row.address }
    }

    // Las fechas se calculan en la zona horaria de la empresa, no en la del servidor
    const issuedAt = this.now()
    const today = todayInTimezone(issuedAt, settings.timezone)
    if (data.dueDate && data.dueDate < today) return fail('El vencimiento no puede ser anterior a hoy')
    const dueDate = data.dueDate ?? (settings.defaultDueDays > 0 ? addDays(today, settings.defaultDueDays) : null)

    const lines: IssueLineCommand[] = drafts.map((d, index) => ({
      position: index + 1,
      productId: d.productId,
      sku: d.sku,
      description: d.description,
      unit: d.unit,
      quantity: d.line.quantity,
      unitPrice: d.unitPrice,
      discountType: d.line.discountType,
      discountValue: d.line.discountValue,
      taxRate: d.line.taxRate ?? d.defaultTaxRate,
      productTaxRate: d.productTaxRate,
      tracksStock: d.tracksStock,
      ...calc.lines[index],
    }))

    const command: IssueCommand = {
      userId,
      idempotencyKey: data.idempotencyKey,
      documentType: data.documentType,
      documentPrefixes: settings.documentPrefixes,
      customer,
      issuer: await this.invoices.findIssuer(orgId),
      currency: settings.currency,
      currencyDecimals: settings.currencyDecimals,
      taxName: settings.taxName,
      pricesIncludeTax: settings.pricesIncludeTax,
      allowNegativeStock: settings.allowNegativeStock,
      issuedAt,
      dueDate,
      paid: data.paid || calc.totals.total === 0, // un documento de total 0 no tiene nada que cobrar
      paymentMethod: data.paymentMethod ?? 'cash',
      notes: data.notes || null,
      totals: calc.totals,
      lines,
    }

    const outcome = await this.invoices.issue(orgId, command)
    switch (outcome.status) {
      case 'issued':
      case 'duplicate':
        return this.issued(outcome.invoice, settings.documentPrefixes)
      case 'insufficient_stock':
        return fail(shortageMessage(outcome.shortages))
      case 'product_changed':
        return fail(`"${outcome.productName}" cambió mientras preparabas el documento. Revisa la línea e inténtalo de nuevo`)
    }
  }

  /**
   * Las líneas de un documento con lo ya acreditado, para armar la nota de crédito. Crear notas queda
   * reservado a quien puede anular documentos (corrigen un documento emitido): sin permiso o si el
   * documento no se puede acreditar devuelve null.
   */
  async getCreditContext(
    userId: string,
    organizationId: string,
    invoiceId: string,
  ): Promise<{ context: CreditContext; display: InvoiceListDisplay } | null> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.void')
    if (!access) return null
    const context = await this.invoices.findCreditContext(access.organizationId, invoiceId)
    if (!context) return null
    return { context, display: displayOf(await this.loadSettings(access.organizationId)) }
  }

  /** Emite una nota de crédito sobre un documento emitido. Los montos los calcula el servidor, no el navegador. */
  async issueCreditNote(userId: string, organizationId: string, input: IssueCreditNoteInput): Promise<CreditNoteResponse> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.void')
    if (!access) return fail('No tienes permisos para emitir notas de crédito')
    const orgId = access.organizationId

    const parsed = IssueCreditNoteSchema.safeParse(input)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const data = parsed.data

    const settings = await this.loadSettings(orgId)

    // Reintento o doble clic: se devuelve la nota ya emitida en lugar de crear otra
    const replay = await this.invoices.findCreditNoteByIdempotencyKey(orgId, data.idempotencyKey)
    if (replay) return this.creditNoteIssued(replay, settings)

    const command: IssueCreditNoteCommand = {
      userId,
      invoiceId: data.invoiceId,
      idempotencyKey: data.idempotencyKey,
      reason: data.reason,
      lines: data.lines,
      documentPrefixes: settings.documentPrefixes,
      issuedAt: this.now(),
    }

    const outcome = await this.invoices.issueCreditNote(orgId, command)
    switch (outcome.status) {
      case 'issued':
      case 'duplicate':
        return this.creditNoteIssued(outcome.creditNote, settings)
      case 'not_found':
        return fail('El documento no existe')
      case 'not_issued':
        return fail(outcome.current === 'void' ? 'El documento está anulado' : 'Solo se pueden acreditar documentos emitidos')
      case 'is_credit_note':
        return fail('No se puede acreditar una nota de crédito')
      case 'line_not_found':
        return fail(at(outcome.index) + 'no pertenece al documento')
      case 'invalid':
        return fail(outcome.message)
    }
  }

  async voidInvoice(userId: string, organizationId: string, input: VoidInvoiceInput): Promise<IssueResponse> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.void')
    if (!access) return fail('No tienes permisos para anular documentos')

    const parsed = VoidInvoiceSchema.safeParse(input)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos')

    const settings = await this.loadSettings(access.organizationId)
    const outcome = await this.invoices.voidInvoice(access.organizationId, {
      userId,
      invoiceId: parsed.data.invoiceId,
      reason: parsed.data.reason,
      documentPrefixes: settings.documentPrefixes,
      voidedAt: this.now(),
    })

    switch (outcome.status) {
      case 'not_found':
        return fail('El documento no existe')
      case 'not_issued':
        return fail(
          outcome.current === 'void' ? 'El documento ya está anulado' : 'Solo se pueden anular documentos emitidos',
        )
      case 'is_credit_note':
        return fail('Una nota de crédito emitida no se puede anular')
      case 'has_credit_notes':
        return fail('El documento tiene notas de crédito emitidas: no se puede anular')
      case 'voided':
        return {
          error: '',
          success: `Documento anulado: ${formatDocumentNumber(settings.documentPrefixes, outcome.invoice.documentType, outcome.invoice.number)}`,
        }
    }
  }

  private creditNoteIssued(note: IssuedCreditNote, settings: BillingSettings): CreditNoteResponse {
    const label = formatDocumentNumber(settings.documentPrefixes, 'credit_note', note.number)
    const money = (value: number) =>
      formatMoney(value, { currency: note.currency, locale: settings.locale, decimals: note.currencyDecimals })
    // Con opción A la nota reduce el saldo; si el documento ya estaba cobrado queda saldo a favor del cliente
    // y la devolución del dinero se hace fuera del sistema.
    const balance =
      note.balance < 0
        ? ` Saldo a favor del cliente: ${money(-note.balance)} (la devolución del dinero se hace fuera del sistema).`
        : note.balance > 0
          ? ` Saldo pendiente del documento: ${money(note.balance)}.`
          : ' El documento queda sin saldo pendiente.'
    return { error: '', success: `Nota de crédito emitida: ${label}.${balance}`, creditNote: note }
  }

  private async loadSettings(organizationId: string) {
    return (await this.settings.find(organizationId)) ?? structuredClone(DEFAULT_BILLING_SETTINGS)
  }

  private issued(invoice: IssuedInvoice, prefixes: IssueCommand['documentPrefixes']): IssueResponse {
    const label = formatDocumentNumber(prefixes, invoice.documentType, invoice.number)
    return { error: '', success: `Documento emitido: ${label}`, invoice }
  }
}

export const invoiceService = new InvoiceService(
  invoiceRepository,
  billingSettingsRepository,
  customerRepository,
  accessService,
)
