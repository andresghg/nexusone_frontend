export const DOCUMENT_TYPES = ['invoice', 'receipt', 'sales_note'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

// Tipos que se emiten desde el formulario de facturación. La nota de crédito NO está aquí a propósito:
// nace de un documento ya emitido (ver CREDIT_NOTE_TYPE) y el formulario de emisión no debe ofrecerla.
export const CREDIT_NOTE_TYPE = 'credit_note' as const
export const CREDIT_NOTE_DEFAULT_PREFIX = 'NC'
export type AnyDocumentType = DocumentType | typeof CREDIT_NOTE_TYPE

export const ANY_DOCUMENT_TYPE_LABELS: Record<AnyDocumentType, string> = {
  invoice: 'Factura',
  receipt: 'Recibo',
  sales_note: 'Nota de venta',
  credit_note: 'Nota de crédito',
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice: 'Factura',
  receipt: 'Recibo',
  sales_note: 'Nota de venta',
}

// draft: editable y sin número · issued: emitida e inmutable · void: anulada (conserva su número)
export const INVOICE_STATUSES = ['draft', 'issued', 'void'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

// Cómo se pagó. 'other' agrupa lo que no calza en los demás (cheque, canje…).
export const PAYMENT_METHODS = ['cash', 'transfer', 'card', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
}

// percent: 0–100 sobre el monto de la línea · amount: monto fijo en la moneda del documento
export const DISCOUNT_TYPES = ['percent', 'amount'] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]

// Límites que comparten el cálculo, los schemas y las columnas numeric(14,x) de la base.
export const MAX_AMOUNT = 999_999_999_999.99
export const MAX_QUANTITY = 99_999_999
export const MAX_INVOICE_LINES = 200

// Un prefijo por tipo de documento, la nota de crédito incluida. Las empresas anteriores a las notas lo reciben
// de DEFAULT_BILLING_SETTINGS al leer su configuración.
export type DocumentPrefixes = Record<AnyDocumentType, string>

// Configuración de facturación de una empresa. Si no tiene fila, rige DEFAULT_BILLING_SETTINGS.
export type BillingSettings = {
  currency: string // ISO 4217: 'CLP', 'USD'…
  currencyDecimals: number // 0–2: decimales con que se redondean y muestran los montos
  locale: string // formato de números y fechas: 'es-CL'
  timezone: string // IANA: 'America/Santiago'
  taxName: string // 'IVA', 'VAT', 'IGV'…
  taxRate: number // % por defecto de las líneas nuevas (cada línea puede llevar el suyo; 0 = exento)
  pricesIncludeTax: boolean // true: el precio del producto ya trae el impuesto
  allowNegativeStock: boolean // false: no se puede facturar más de lo que hay en stock
  defaultDueDays: number // días de plazo para el vencimiento (0 = al contado)
  documentPrefixes: DocumentPrefixes
}

// Lo mínimo para mostrar montos, números y fechas con el formato de la empresa. Es lo único de la configuración
// que otras pantallas (inventario) necesitan, y por eso se puede leer sin permiso de facturación.
export type DisplayFormat = Pick<BillingSettings, 'currency' | 'currencyDecimals' | 'locale' | 'timezone'>

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  currency: 'CLP',
  currencyDecimals: 0,
  locale: 'es-CL',
  timezone: 'America/Santiago',
  taxName: 'IVA',
  taxRate: 19,
  pricesIncludeTax: true,
  allowNegativeStock: false,
  defaultDueDays: 0,
  documentPrefixes: { invoice: 'F', receipt: 'R', sales_note: 'NV', credit_note: CREDIT_NOTE_DEFAULT_PREFIX },
}

export const DEFAULT_DISPLAY_FORMAT: DisplayFormat = {
  currency: DEFAULT_BILLING_SETTINGS.currency,
  currencyDecimals: DEFAULT_BILLING_SETTINGS.currencyDecimals,
  locale: DEFAULT_BILLING_SETTINGS.locale,
  timezone: DEFAULT_BILLING_SETTINGS.timezone,
}
