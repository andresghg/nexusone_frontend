import type {
  DiscountType,
  DocumentPrefixes,
  DocumentType,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
} from './billing'

// Producto tal como se lee para vender: precio, nombre y estado salen SIEMPRE de la base de datos.
export type SaleProduct = {
  id: string
  sku: string
  name: string
  unit: string
  price: number
  taxRate: number | null // impuesto propio en %; null = la tasa de la empresa; 0 = exento
  trackStock: boolean
  active: boolean
}

// Un producto como lo ve el buscador del formulario de facturación.
export type ProductOption = {
  id: string
  sku: string
  barcode: string | null
  name: string
  unit: string
  price: number
  taxRate: number | null // impuesto propio en %; null = la tasa de la empresa; 0 = exento
  trackStock: boolean
  stock: number | null // null = no controla stock
}

export type IssuedInvoice = {
  id: string
  number: number
  documentType: DocumentType
  total: number
}

export type StockShortage = {
  productId: string
  name: string
  unit: string
  available: number // en milésimas
  requested: number // en milésimas
}

// Una línea ya valorizada, lista para guardar. Los montos los calculó calculateInvoice.
export type IssueLineCommand = {
  position: number
  productId: string | null
  sku: string | null
  description: string
  unit: string
  quantity: number
  unitPrice: number
  discountType: DiscountType
  discountValue: number
  taxRate: number
  // La tasa propia que tenía el producto al preparar el documento (null si no tenía o es un concepto libre).
  // La transacción comprueba que no cambió: si cambió, el documento se prepararía con una tasa vieja.
  productTaxRate: number | null
  tracksStock: boolean
  gross: number
  discount: number
  net: number
  tax: number
  total: number
}

export type CustomerSnapshot = {
  id: string
  name: string
  taxId: string | null
  email: string | null
  address: string | null
}

export type IssuerSnapshot = {
  legalName: string | null
  taxId: string | null
  address: string | null
}

// Todo lo que la transacción necesita para emitir, ya decidido por el service.
export type IssueCommand = {
  userId: string
  idempotencyKey: string
  documentType: DocumentType
  documentPrefixes: DocumentPrefixes // para escribir el número en el motivo del movimiento de stock
  customer: CustomerSnapshot | null
  issuer: IssuerSnapshot
  currency: string
  currencyDecimals: number
  taxName: string
  pricesIncludeTax: boolean
  allowNegativeStock: boolean
  issuedAt: Date
  dueDate: string | null // YYYY-MM-DD
  paid: boolean
  paymentMethod: PaymentMethod // con qué se cobra al emitir; solo se usa si paid
  notes: string | null
  totals: { subtotal: number; discountTotal: number; taxTotal: number; total: number }
  lines: IssueLineCommand[]
}

export type IssueOutcome =
  | { status: 'issued'; invoice: IssuedInvoice }
  | { status: 'duplicate'; invoice: IssuedInvoice } // la misma clave de idempotencia ya emitió este documento
  | { status: 'insufficient_stock'; shortages: StockShortage[] }
  | { status: 'product_changed'; productName: string } // cambió, se archivó o desapareció mientras se preparaba

export type VoidCommand = {
  userId: string
  invoiceId: string
  reason: string
  documentPrefixes: DocumentPrefixes
  voidedAt: Date
}

export type VoidOutcome =
  | { status: 'voided'; invoice: { id: string; number: number; documentType: DocumentType } }
  | { status: 'not_found' }
  | { status: 'not_issued'; current: InvoiceStatus }

// ---------- Lista de documentos ----------

// Filtros que elige la persona en la pantalla (todos opcionales; 'all' = sin filtro).
export type InvoiceStatusFilter = 'all' | 'issued' | 'void'
// 'overdue' = emitido, con saldo pendiente y vencimiento ya pasado
export type PaymentFilter = 'all' | PaymentStatus | 'overdue'
export type DocumentTypeFilter = 'all' | DocumentType
export type InvoicePeriod = 'all' | 'today' | 'week' | 'month' | 'last_month'

export type InvoiceListFilters = {
  search?: string
  status?: InvoiceStatusFilter
  payment?: PaymentFilter
  documentType?: DocumentTypeFilter
  period?: InvoicePeriod
}

// Lo que entiende el repositorio: el período ya resuelto a fechas de calendario de la empresa.
export type InvoiceQueryFilters = Omit<InvoiceListFilters, 'period'> & {
  from?: string // YYYY-MM-DD, inclusive
  to?: string // YYYY-MM-DD, inclusive
  timezone: string
  today: string // YYYY-MM-DD en la zona de la empresa; define qué está vencido
  documentPrefixes: DocumentPrefixes // para que "F-000012" encuentre solo la factura, no también el recibo R-000012
}

export type InvoiceListRow = {
  id: string
  documentType: DocumentType
  number: number
  status: InvoiceStatus // 'issued' | 'void': los borradores no se listan
  paymentStatus: PaymentStatus
  customerName: string | null
  customerTaxId: string | null
  total: number
  paidTotal: number // lo cobrado hasta ahora; total − paidTotal es el saldo
  currency: string // los del documento al emitirse, no los de hoy
  currencyDecimals: number
  issuedAt: string // ISO
  dueDate: string | null // YYYY-MM-DD
  overdue: boolean
  voidReason: string | null
}

// Cómo mostrar fechas, números y prefijos: viene de la configuración de la empresa.
export type InvoiceListDisplay = {
  locale: string
  timezone: string
  documentPrefixes: DocumentPrefixes
}

export type InvoicePage = {
  rows: InvoiceListRow[]
  total: number
  display: InvoiceListDisplay
}

// ---------- Detalle de un documento ----------

export type InvoiceDetailItem = {
  position: number
  productId: string | null
  sku: string | null
  description: string
  unit: string
  quantity: number
  unitPrice: number
  discountType: DiscountType
  discountValue: number
  taxRate: number
  lineGross: number
  lineDiscount: number
  lineNet: number
  lineTax: number
  lineTotal: number
}

export type InvoicePayment = {
  id: string
  amount: number
  method: PaymentMethod
  reference: string | null
  paidAt: string // ISO
  voidedAt: string | null // ISO; un pago anulado no cuenta en lo cobrado
  voidReason: string | null
}

export type InvoiceDetail = {
  id: string
  documentType: DocumentType
  number: number
  status: InvoiceStatus
  paymentStatus: PaymentStatus
  issuedAt: string // ISO
  dueDate: string | null // YYYY-MM-DD
  overdue: boolean
  currency: string
  currencyDecimals: number
  taxName: string
  pricesIncludeTax: boolean
  // Datos copiados al emitir: no cambian aunque después se edite el cliente o la empresa
  customer: { name: string; taxId: string | null; email: string | null; address: string | null } | null
  issuer: IssuerSnapshot
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paidTotal: number
  balance: number // total − paidTotal
  notes: string | null
  voidReason: string | null
  voidedAt: string | null // ISO
  items: InvoiceDetailItem[]
  payments: InvoicePayment[] // del más antiguo al más reciente, anulados incluidos
}

// ---------- Cobros ----------

export type AddPaymentCommand = {
  userId: string
  invoiceId: string
  amount: number
  method: PaymentMethod
  reference: string | null
  paidAt: Date
}

export type PaymentOutcome =
  | {
      status: 'added'
      paymentStatus: PaymentStatus
      paidTotal: number
      balance: number
      currency: string
      currencyDecimals: number
    }
  | { status: 'not_found' }
  | { status: 'not_issued'; current: InvoiceStatus }
  | { status: 'settled' } // ya no queda saldo
  | { status: 'exceeds_balance'; balance: number; currency: string; currencyDecimals: number }
  | { status: 'invalid_amount'; currencyDecimals: number } // más decimales de los que admite la moneda

export type VoidPaymentCommand = {
  userId: string
  paymentId: string
  reason: string
  voidedAt: Date
}

export type VoidPaymentOutcome =
  | { status: 'voided'; invoiceId: string; paymentStatus: PaymentStatus; paidTotal: number }
  | { status: 'not_found' }
  | { status: 'already_voided' }
  | { status: 'not_issued'; current: InvoiceStatus }
