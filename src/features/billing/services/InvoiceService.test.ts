import { describe, expect, it, vi } from 'vitest'
import type { IAccessResolver } from '@/features/organization/services/AccessService'
import type { ICustomerRepository } from '@/features/customers/services/CustomerRepository'
import type { CustomerRow } from '@/features/customers/types/customers'
import type { Permission } from '@/types/navigation'
import type { IssueInvoiceInput } from '../schemas/invoiceSchema'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '../types/billing'
import type {
  CreditContext,
  InvoiceDetail,
  InvoiceListRow,
  IssueCreditNoteOutcome,
  IssuedCreditNote,
  PaymentOutcome,
  VoidPaymentOutcome,
  IssueCommand,
  IssuedInvoice,
  IssueOutcome,
  ProductOption,
  SaleProduct,
  VoidOutcome,
} from '../types/invoice'
import type { IBillingSettingsRepository } from './BillingSettingsRepository'
import type { IInvoiceRepository } from './InvoiceRepository'
import { InvoiceService } from './InvoiceService'

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'
const COLA_ID = '33333333-3333-4333-8333-333333333333'
const PAN_ID = '66666666-6666-4666-8666-666666666666'
const CUSTOMER_ID = '77777777-7777-4777-8777-777777777777'
const KEY = '44444444-4444-4444-8444-444444444444'
const INVOICE_ID = '55555555-5555-4555-8555-555555555555'
const ALL: Permission[] = ['pos.facturacion.create', 'pos.facturacion.void', 'pos.facturacion.adjust', 'pos.facturacion.read']
const CASHIER: Permission[] = ['pos.facturacion.create'] // vende a precio de lista, con la tasa de la empresa

const cola: SaleProduct = { id: COLA_ID, sku: 'COLA', name: 'Cola 1L', unit: 'un', price: 1190, taxRate: null, trackStock: true, active: true }
const pan: SaleProduct = { id: PAN_ID, sku: 'PAN', name: 'Pan', unit: 'kg', price: 2000, taxRate: null, trackStock: false, active: true }

const customer = (over: Partial<CustomerRow> = {}): CustomerRow => ({
  id: CUSTOMER_ID, name: 'Ana Pérez', taxId: '12345678-5', email: 'ana@x.cl', phone: null, address: 'Av. 1',
  notes: null, active: true, createdAt: '2026-11-01T00:00:00.000Z', ...over,
})

const issuedInvoice: IssuedInvoice = { id: INVOICE_ID, number: 12, documentType: 'invoice', total: 2380 }

const productLine = (productId = COLA_ID, quantity = 2, over = {}) => ({
  productId, description: 'ignorado', unit: 'ignorado', quantity, unitPrice: 1, // el navegador manda un precio falso: se ignora
  discountType: 'percent' as const, discountValue: 0, taxRate: null, ...over,
})
const freeLine = (over = {}) => ({
  productId: null, description: 'Flete', unit: '', quantity: 1, unitPrice: 5000,
  discountType: 'percent' as const, discountValue: 0, taxRate: null, ...over,
})
const input = (over: Partial<IssueInvoiceInput> = {}): IssueInvoiceInput => ({
  documentType: 'invoice', customerId: null, dueDate: null, notes: '', paid: false,
  idempotencyKey: KEY, lines: [productLine()], ...over,
})

const NOW = new Date('2026-11-10T15:00:00Z') // 12:00 en Santiago

function setup({
  granted = ALL,
  settings = null as BillingSettings | null,
  products = [cola, pan],
  customerRow = customer() as CustomerRow | null, // null = el cliente no existe
  outcome = { status: 'issued', invoice: issuedInvoice } as IssueOutcome,
  voidOutcome = { status: 'voided', invoice: { id: INVOICE_ID, number: 12, documentType: 'invoice' } } as VoidOutcome,
  existing = undefined as IssuedInvoice | undefined,
  page = { rows: [] as InvoiceListRow[], total: 0 },
  options = [] as ProductOption[],
  detail = undefined as InvoiceDetail | undefined,
  paymentOutcome = { status: 'not_found' } as PaymentOutcome,
  voidPaymentOutcome = { status: 'not_found' } as VoidPaymentOutcome,
  creditContext = undefined as CreditContext | undefined,
  creditOutcome = { status: 'not_found' } as IssueCreditNoteOutcome,
  creditReplay = undefined as IssuedCreditNote | undefined,
  now = NOW,
} = {}) {
  const invoices = {
    findProducts: vi.fn(async (_org: string, ids: string[]) => products.filter((p) => ids.includes(p.id))),
    findIssuer: vi.fn().mockResolvedValue({ legalName: 'Acme SpA', taxId: '76.000.000-1', address: 'Calle 1' }),
    findByIdempotencyKey: vi.fn().mockResolvedValue(existing),
    findPage: vi.fn().mockResolvedValue(page),
    searchProducts: vi.fn().mockResolvedValue(options),
    findDetail: vi.fn().mockResolvedValue(detail),
    addPayment: vi.fn().mockResolvedValue(paymentOutcome),
    voidPayment: vi.fn().mockResolvedValue(voidPaymentOutcome),
    issue: vi.fn().mockResolvedValue(outcome),
    voidInvoice: vi.fn().mockResolvedValue(voidOutcome),
    findCreditContext: vi.fn().mockResolvedValue(creditContext),
    findCreditNoteByIdempotencyKey: vi.fn().mockResolvedValue(creditReplay),
    issueCreditNote: vi.fn().mockResolvedValue(creditOutcome),
  } satisfies IInvoiceRepository

  const settingsRepo = {
    find: vi.fn().mockResolvedValue(settings),
    save: vi.fn(),
  } satisfies IBillingSettingsRepository

  const customers = {
    findPage: vi.fn(),
    findById: vi.fn().mockResolvedValue(customerRow ?? undefined),
    create: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
  } satisfies ICustomerRepository

  const access = {
    authorize: vi.fn(async (_userId: string, organizationId: string, permission: Permission) =>
      organizationId === ORG_ID && granted.includes(permission)
        ? { organizationId: ORG_ID, role: 'member', permissions: granted }
        : null,
    ),
  } satisfies IAccessResolver

  const service = new InvoiceService(invoices, settingsRepo, customers, access, () => now)
  return { invoices, settingsRepo, customers, access, service }
}

// El comando que el servicio entregó al repositorio
const commandOf = (invoices: ReturnType<typeof setup>['invoices']) =>
  invoices.issue.mock.calls[0][1] as IssueCommand

describe('InvoiceService.issue · permisos y validación', () => {
  it('sin permiso de emitir no hace nada (anular no basta)', async () => {
    const { invoices, service } = setup({ granted: ['pos.facturacion.void'] })
    expect(await service.issue('u1', ORG_ID, input())).toEqual({ error: 'No tienes permisos para emitir documentos', success: '' })
    expect(invoices.issue).not.toHaveBeenCalled()
    expect(invoices.findProducts).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { invoices, service } = setup()
    expect((await service.issue('u1', OTHER_ORG_ID, input())).error).toBe('No tienes permisos para emitir documentos')
    expect(invoices.issue).not.toHaveBeenCalled()
  })

  it('datos inválidos: devuelve el primer mensaje del schema', async () => {
    const { invoices, service } = setup()
    expect((await service.issue('u1', ORG_ID, input({ lines: [] }))).error).toBe('Agrega al menos un producto')
    expect(invoices.issue).not.toHaveBeenCalled()
  })

  it('un error de cálculo indica la línea', async () => {
    const { invoices, service } = setup()
    const result = await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1), productLine(COLA_ID, 0)] }))
    expect(result.error).toBe('Línea 2: la cantidad debe ser mayor a 0')
    expect(invoices.issue).not.toHaveBeenCalled()
  })
})

describe('InvoiceService.issue · productos y precios', () => {
  it('el precio, nombre, unidad y control de stock salen de la base, no del navegador', async () => {
    const { invoices, service } = setup()
    await service.issue('u1', ORG_ID, input())

    const command = commandOf(invoices)
    expect(command.lines[0]).toMatchObject({
      position: 1, productId: COLA_ID, sku: 'COLA', description: 'Cola 1L', unit: 'un',
      unitPrice: 1190, tracksStock: true, quantity: 2,
    })
  })

  it('calcula los montos con la configuración de la empresa (precios con impuesto incluido por defecto)', async () => {
    const { invoices, service } = setup()
    await service.issue('u1', ORG_ID, input())

    const command = commandOf(invoices)
    expect(command.lines[0]).toMatchObject({ gross: 2380, discount: 0, net: 2000, tax: 380, total: 2380, taxRate: 19 })
    expect(command.totals).toMatchObject({ subtotal: 2000, discountTotal: 0, taxTotal: 380, total: 2380 })
    expect(command).toMatchObject({ currency: 'CLP', currencyDecimals: 0, taxName: 'IVA', pricesIncludeTax: true })
  })

  it('con precios sin impuesto, el impuesto se suma', async () => {
    const { invoices, service } = setup({ settings: { ...DEFAULT_BILLING_SETTINGS, pricesIncludeTax: false } })
    await service.issue('u1', ORG_ID, input())
    expect(commandOf(invoices).totals).toMatchObject({ subtotal: 2380, taxTotal: 452, total: 2832 })
  })

  it('la tasa de la línea manda; si es null, la de la empresa; 0 es exento', async () => {
    const { invoices, service } = setup({ settings: { ...DEFAULT_BILLING_SETTINGS, taxRate: 10 } })
    await service.issue('u1', ORG_ID, input({
      lines: [productLine(COLA_ID, 1), productLine(COLA_ID, 1, { taxRate: 0 }), productLine(COLA_ID, 1, { taxRate: 19 })],
    }))
    expect(commandOf(invoices).lines.map((l) => l.taxRate)).toEqual([10, 0, 19])
  })

  it('aplica los descuentos de la línea', async () => {
    const { invoices, service } = setup()
    await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 2, { discountValue: 10 })] }))
    expect(commandOf(invoices).lines[0]).toMatchObject({ discount: 238, total: 2142 })
  })

  it('un concepto libre usa lo que escribe el usuario, sin producto ni stock', async () => {
    const { invoices, service } = setup()
    await service.issue('u1', ORG_ID, input({ lines: [freeLine()] }))
    expect(commandOf(invoices).lines[0]).toMatchObject({
      productId: null, sku: null, description: 'Flete', unit: 'un', unitPrice: 5000, tracksStock: false,
    })
  })

  it('mezcla productos con y sin stock, y numera las líneas', async () => {
    const { invoices, service } = setup()
    await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1), productLine(PAN_ID, 3), freeLine()] }))
    const lines = commandOf(invoices).lines
    expect(lines.map((l) => [l.position, l.tracksStock])).toEqual([[1, true], [2, false], [3, false]])
    expect(invoices.findProducts).toHaveBeenCalledWith(ORG_ID, [COLA_ID, PAN_ID])
  })

  it('un producto que no existe en la empresa se rechaza con el número de línea', async () => {
    const { invoices, service } = setup({ products: [] })
    expect((await service.issue('u1', ORG_ID, input())).error).toBe('Línea 1: el producto ya no existe')
    expect(invoices.issue).not.toHaveBeenCalled()
  })

  it('un producto archivado se rechaza', async () => {
    const { invoices, service } = setup({ products: [{ ...cola, active: false }] })
    expect((await service.issue('u1', ORG_ID, input())).error).toBe('Línea 1: "Cola 1L" está archivado y no se puede facturar')
    expect(invoices.issue).not.toHaveBeenCalled()
  })
})

describe('InvoiceService.issue · cliente, emisor y fechas', () => {
  it('sin cliente, el documento va sin cliente', async () => {
    const { customers, invoices, service } = setup()
    await service.issue('u1', ORG_ID, input())
    expect(commandOf(invoices).customer).toBeNull()
    expect(customers.findById).not.toHaveBeenCalled()
  })

  it('copia los datos del cliente y los de la empresa emisora', async () => {
    const { customers, invoices, service } = setup()
    await service.issue('u1', ORG_ID, input({ customerId: CUSTOMER_ID }))

    expect(customers.findById).toHaveBeenCalledWith(ORG_ID, CUSTOMER_ID)
    expect(commandOf(invoices).customer).toEqual({ id: CUSTOMER_ID, name: 'Ana Pérez', taxId: '12345678-5', email: 'ana@x.cl', address: 'Av. 1' })
    expect(commandOf(invoices).issuer).toEqual({ legalName: 'Acme SpA', taxId: '76.000.000-1', address: 'Calle 1' })
  })

  it('un cliente inexistente o archivado se rechaza', async () => {
    const missing = setup({ customerRow: null })
    expect((await missing.service.issue('u1', ORG_ID, input({ customerId: CUSTOMER_ID }))).error).toBe('El cliente no existe')
    expect(missing.invoices.issue).not.toHaveBeenCalled()

    const archived = setup({ customerRow: customer({ active: false }) })
    expect((await archived.service.issue('u1', ORG_ID, input({ customerId: CUSTOMER_ID }))).error).toBe('El cliente está archivado')
    expect(archived.invoices.issue).not.toHaveBeenCalled()
  })

  it('el vencimiento por defecto se cuenta desde hoy en la zona horaria de la empresa', async () => {
    const { invoices, service } = setup({ settings: { ...DEFAULT_BILLING_SETTINGS, defaultDueDays: 30 } })
    await service.issue('u1', ORG_ID, input())
    expect(commandOf(invoices).dueDate).toBe('2026-12-10')
  })

  it('al contado (0 días) no hay vencimiento', async () => {
    const { invoices, service } = setup()
    await service.issue('u1', ORG_ID, input())
    expect(commandOf(invoices).dueDate).toBeNull()
  })

  it('un vencimiento indicado manda sobre el plazo por defecto, pero no puede ser pasado', async () => {
    const { invoices, service } = setup({ settings: { ...DEFAULT_BILLING_SETTINGS, defaultDueDays: 30 } })
    await service.issue('u1', ORG_ID, input({ dueDate: '2026-11-20' }))
    expect(commandOf(invoices).dueDate).toBe('2026-11-20')

    const past = setup()
    expect((await past.service.issue('u1', ORG_ID, input({ dueDate: '2026-11-09' }))).error).toBe('El vencimiento no puede ser anterior a hoy')
    expect(past.invoices.issue).not.toHaveBeenCalled()
    // hoy mismo es válido
    expect((await setup().service.issue('u1', ORG_ID, input({ dueDate: '2026-11-10' }))).error).toBe('')
  })

  it('"hoy" es el de la zona horaria de la empresa, no el del servidor', async () => {
    // 02:00 UTC del 10 es todavía el 9 de noviembre en Santiago
    const early = new Date('2026-11-10T02:00:00Z')
    const { invoices, access, settingsRepo, customers } = setup()
    const service = new InvoiceService(invoices, settingsRepo, customers, access, () => early)
    expect((await service.issue('u1', ORG_ID, input({ dueDate: '2026-11-09' }))).error).toBe('')
  })

  it('pasa al repositorio el usuario, la clave, el estado de pago y las notas recortadas', async () => {
    const { invoices, service } = setup()
    await service.issue('u1', ORG_ID, input({ paid: true, notes: '  entregar el lunes ' }))
    expect(commandOf(invoices)).toMatchObject({
      userId: 'u1', idempotencyKey: KEY, documentType: 'invoice', paid: true, notes: 'entregar el lunes',
      issuedAt: NOW, allowNegativeStock: false,
    })
    expect((await (async () => { const s = setup(); await s.service.issue('u1', ORG_ID, input()); return commandOf(s.invoices) })()).notes).toBeNull()
  })

  it('usa la configuración guardada de la empresa', async () => {
    const settings: BillingSettings = {
      ...DEFAULT_BILLING_SETTINGS, currency: 'USD', currencyDecimals: 2, taxName: 'VAT', taxRate: 21, allowNegativeStock: true,
    }
    const { invoices, service } = setup({ settings })
    await service.issue('u1', ORG_ID, input())
    expect(commandOf(invoices)).toMatchObject({ currency: 'USD', currencyDecimals: 2, taxName: 'VAT', allowNegativeStock: true })
    expect(commandOf(invoices).lines[0].taxRate).toBe(21)
  })
})

describe('InvoiceService.issue · resultado', () => {
  it('emitido: mensaje con el número del documento', async () => {
    const { service } = setup()
    expect(await service.issue('u1', ORG_ID, input())).toEqual({
      error: '', success: 'Documento emitido: F-000012', invoice: issuedInvoice,
    })
  })

  it('el número usa los prefijos configurados por la empresa', async () => {
    const settings = { ...DEFAULT_BILLING_SETTINGS, documentPrefixes: { invoice: 'FAC', receipt: 'R', sales_note: 'NV', credit_note: 'NC' } }
    const { service } = setup({ settings })
    expect((await service.issue('u1', ORG_ID, input())).success).toBe('Documento emitido: FAC-000012')
  })

  it('una clave repetida que ya emitió devuelve ese documento sin volver a emitir', async () => {
    const { invoices, service } = setup({ existing: issuedInvoice })
    const result = await service.issue('u1', ORG_ID, input())
    expect(result).toEqual({ error: '', success: 'Documento emitido: F-000012', invoice: issuedInvoice })
    expect(invoices.findByIdempotencyKey).toHaveBeenCalledWith(ORG_ID, KEY)
    expect(invoices.issue).not.toHaveBeenCalled()
    expect(invoices.findProducts).not.toHaveBeenCalled()
  })

  it('si la carrera la gana otra solicitud (duplicate), también devuelve ese documento', async () => {
    const { service } = setup({ outcome: { status: 'duplicate', invoice: issuedInvoice } })
    expect((await service.issue('u1', ORG_ID, input())).success).toBe('Documento emitido: F-000012')
  })

  it('sin stock suficiente: lista todos los productos que faltan, sin mostrar cantidades negativas', async () => {
    const { service } = setup({
      outcome: {
        status: 'insufficient_stock',
        shortages: [
          { productId: COLA_ID, name: 'Cola 1L', unit: 'un', available: 3000, requested: 5000 },
          { productId: PAN_ID, name: 'Pan', unit: 'kg', available: -2500, requested: 1500 },
        ],
      },
    })
    expect(await service.issue('u1', ORG_ID, input())).toEqual({
      error: 'Stock insuficiente: Cola 1L (disponible 3 un, pedido 5 un); Pan (disponible 0 kg, pedido 1.5 kg)',
      success: '',
    })
  })

  it('un producto que cambió mientras se preparaba pide revisar la línea', async () => {
    const { service } = setup({ outcome: { status: 'product_changed', productName: 'Cola 1L' } })
    expect((await service.issue('u1', ORG_ID, input())).error).toBe(
      '"Cola 1L" cambió mientras preparabas el documento. Revisa la línea e inténtalo de nuevo',
    )
  })

  it('un error inesperado del repositorio se propaga (la acción lo convierte en un mensaje genérico)', async () => {
    const { invoices, service } = setup()
    invoices.issue.mockRejectedValue(new Error('conexión caída'))
    await expect(service.issue('u1', ORG_ID, input())).rejects.toThrow('conexión caída')
  })
})

describe('InvoiceService.voidInvoice', () => {
  const request = { invoiceId: INVOICE_ID, reason: '  Error de digitación ' }

  it('solo quien puede anular: emitir no basta', async () => {
    const { invoices, service } = setup({ granted: ['pos.facturacion.create'] })
    expect(await service.voidInvoice('u1', ORG_ID, request)).toEqual({ error: 'No tienes permisos para anular documentos', success: '' })
    expect(invoices.voidInvoice).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { invoices, service } = setup()
    expect((await service.voidInvoice('u1', OTHER_ORG_ID, request)).error).toBe('No tienes permisos para anular documentos')
    expect(invoices.voidInvoice).not.toHaveBeenCalled()
  })

  it('exige un motivo y un documento válido', async () => {
    const { invoices, service } = setup()
    expect((await service.voidInvoice('u1', ORG_ID, { invoiceId: INVOICE_ID, reason: ' ab ' })).error).toBe('Indica el motivo de la anulación')
    expect((await service.voidInvoice('u1', ORG_ID, { invoiceId: 'x', reason: 'Error' })).error).toBe('Documento inválido')
    expect(invoices.voidInvoice).not.toHaveBeenCalled()
  })

  it('anula con el usuario, el motivo recortado, los prefijos y la hora actual', async () => {
    const { invoices, service } = setup()
    const result = await service.voidInvoice('u1', ORG_ID, request)

    expect(result).toEqual({ error: '', success: 'Documento anulado: F-000012' })
    expect(invoices.voidInvoice).toHaveBeenCalledWith(ORG_ID, {
      userId: 'u1', invoiceId: INVOICE_ID, reason: 'Error de digitación',
      documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes, voidedAt: NOW,
    })
  })

  it('un documento inexistente, ya anulado o sin emitir da un mensaje claro', async () => {
    const missing = setup({ voidOutcome: { status: 'not_found' } })
    expect((await missing.service.voidInvoice('u1', ORG_ID, request)).error).toBe('El documento no existe')

    const credit = setup({ voidOutcome: { status: 'is_credit_note' } })
    expect((await credit.service.voidInvoice('u1', ORG_ID, request)).error).toBe('Una nota de crédito emitida no se puede anular')
    const withNotes = setup({ voidOutcome: { status: 'has_credit_notes' } })
    expect((await withNotes.service.voidInvoice('u1', ORG_ID, request)).error).toBe('El documento tiene notas de crédito emitidas: no se puede anular')

    const voided = setup({ voidOutcome: { status: 'not_issued', current: 'void' } })
    expect((await voided.service.voidInvoice('u1', ORG_ID, request)).error).toBe('El documento ya está anulado')

    const draft = setup({ voidOutcome: { status: 'not_issued', current: 'draft' } })
    expect((await draft.service.voidInvoice('u1', ORG_ID, request)).error).toBe('Solo se pueden anular documentos emitidos')
  })
})

describe('InvoiceService.list', () => {
  const READ: Permission[] = ['pos.facturacion.read']
  const row = (over: Partial<InvoiceListRow> = {}): InvoiceListRow => ({
    id: INVOICE_ID, documentType: 'invoice', number: 12, status: 'issued', paymentStatus: 'unpaid',
    customerName: 'Ana Pérez', customerTaxId: '12345678-5', total: 2380, paidTotal: 0, creditTotal: 0, currency: 'CLP', currencyDecimals: 0,
    issuedAt: '2026-11-10T15:00:00.000Z', dueDate: null, overdue: false, voidReason: null, ...over,
  })
  const filtersOf = (invoices: ReturnType<typeof setup>['invoices']) => invoices.findPage.mock.calls[0][1]
  const pagingOf = (invoices: ReturnType<typeof setup>['invoices']) => invoices.findPage.mock.calls[0][2]

  it('sin permiso de lectura devuelve la lista vacía y no consulta la base', async () => {
    const { invoices, service } = setup({ granted: ['pos.facturacion.create'] })
    const page = await service.list('u1', ORG_ID)
    expect(page).toMatchObject({ rows: [], total: 0 })
    expect(page.display.locale).toBe('es-CL')
    expect(invoices.findPage).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { invoices, service } = setup({ granted: READ })
    expect(await service.list('u1', OTHER_ORG_ID)).toMatchObject({ rows: [], total: 0 })
    expect(invoices.findPage).not.toHaveBeenCalled()
  })

  it('devuelve las filas y cómo mostrarlas según la configuración de la empresa', async () => {
    const settings: BillingSettings = {
      ...DEFAULT_BILLING_SETTINGS, locale: 'en-US', timezone: 'America/New_York',
      documentPrefixes: { invoice: 'FAC', receipt: 'R', sales_note: 'NV', credit_note: 'NC' },
    }
    const { invoices, service } = setup({ granted: READ, settings, page: { rows: [row()], total: 1 } })
    expect(await service.list('u1', ORG_ID)).toEqual({
      rows: [row()],
      total: 1,
      display: { locale: 'en-US', timezone: 'America/New_York', documentPrefixes: settings.documentPrefixes },
    })
    expect(invoices.findPage).toHaveBeenCalledWith(ORG_ID, expect.anything(), { page: 1, pageSize: 25 })
  })

  it('pasa los filtros al repositorio con la zona horaria y el día de hoy de la empresa', async () => {
    const { invoices, service } = setup({ granted: READ })
    await service.list('u1', ORG_ID, { search: 'ana', status: 'issued', payment: 'overdue', documentType: 'receipt' })
    expect(filtersOf(invoices)).toEqual({
      search: 'ana', status: 'issued', payment: 'overdue', documentType: 'receipt',
      timezone: 'America/Santiago', today: '2026-11-10', documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes,
    })
  })

  it('"hoy" es el de la zona horaria de la empresa, no el del servidor', async () => {
    const { invoices, service } = setup({ granted: READ, now: new Date('2026-11-10T02:00:00Z') })
    await service.list('u1', ORG_ID, { period: 'today' })
    expect(filtersOf(invoices)).toMatchObject({ today: '2026-11-09', from: '2026-11-09', to: '2026-11-09' })
  })

  it.each([
    ['all', undefined, undefined],
    ['today', '2026-11-10', '2026-11-10'],
    ['week', '2026-11-04', '2026-11-10'],
    ['month', '2026-11-01', '2026-11-10'],
    ['last_month', '2026-10-01', '2026-10-31'],
  ] as const)('el período "%s" se traduce a fechas de calendario', async (period, from, to) => {
    const { invoices, service } = setup({ granted: READ })
    await service.list('u1', ORG_ID, { period })
    expect(filtersOf(invoices).from).toBe(from)
    expect(filtersOf(invoices).to).toBe(to)
    expect(filtersOf(invoices)).not.toHaveProperty('period')
  })

  it('normaliza la paginación que llega de la URL', async () => {
    const { invoices, service } = setup({ granted: READ })
    const sizes = async (pagination: { page?: number; pageSize?: number }) => {
      invoices.findPage.mockClear()
      await service.list('u1', ORG_ID, {}, pagination)
      return pagingOf(invoices)
    }
    expect(await sizes({ page: NaN, pageSize: NaN })).toEqual({ page: 1, pageSize: 25 })
    expect(await sizes({ page: -3, pageSize: 0 })).toEqual({ page: 1, pageSize: 1 })
    expect(await sizes({ page: 2.9, pageSize: 10_000_000 })).toEqual({ page: 2, pageSize: 100 })
  })
})

describe('InvoiceService.issue · impuesto propio del producto', () => {
  const libro: SaleProduct = { id: PAN_ID, sku: 'LIBRO', name: 'Libro', unit: 'un', price: 5000, taxRate: 0, trackStock: false, active: true }
  const reducido: SaleProduct = { ...cola, taxRate: 10 }

  it('un producto exento se emite sin impuesto', async () => {
    const { invoices, service } = setup({ granted: CASHIER, products: [libro] })
    expect((await service.issue('u1', ORG_ID, input({ lines: [productLine(PAN_ID, 1)] }))).error).toBe('')
    expect(commandOf(invoices).lines[0]).toMatchObject({ taxRate: 0, productTaxRate: 0, tax: 0, total: 5000, net: 5000 })
    expect(commandOf(invoices).totals).toMatchObject({ taxTotal: 0, total: 5000 })
  })

  it('un producto con tasa propia usa esa tasa, no la de la empresa', async () => {
    const { invoices, service } = setup({ granted: CASHIER, products: [reducido] })
    await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1)] }))
    expect(commandOf(invoices).lines[0]).toMatchObject({ taxRate: 10, productTaxRate: 10, total: 1190, tax: 108 })
  })

  it('un producto sin tasa propia usa la de la empresa y no deja rastro de tasa propia', async () => {
    const { invoices, service } = setup({ granted: CASHIER })
    await service.issue('u1', ORG_ID, input())
    expect(commandOf(invoices).lines[0]).toMatchObject({ taxRate: 19, productTaxRate: null })
  })

  it('cambiar la tasa de la empresa no afecta a un producto con tasa propia', async () => {
    const { invoices, service } = setup({ granted: CASHIER, products: [libro], settings: { ...DEFAULT_BILLING_SETTINGS, taxRate: 21 } })
    await service.issue('u1', ORG_ID, input({ lines: [productLine(PAN_ID, 1)] }))
    expect(commandOf(invoices).lines[0]).toMatchObject({ taxRate: 0, tax: 0 })
  })

  it('con precios sin impuesto, un producto exento tampoco suma impuesto', async () => {
    const { invoices, service } = setup({ granted: CASHIER, products: [libro], settings: { ...DEFAULT_BILLING_SETTINGS, pricesIncludeTax: false } })
    await service.issue('u1', ORG_ID, input({ lines: [productLine(PAN_ID, 2)] }))
    expect(commandOf(invoices).totals).toMatchObject({ subtotal: 10000, taxTotal: 0, total: 10000 })
  })

  it('un documento mezcla productos exentos y gravados, cada uno con lo suyo', async () => {
    const { invoices, service } = setup({ granted: CASHIER, products: [cola, libro] })
    await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1), productLine(PAN_ID, 1), freeLine()] }))
    expect(commandOf(invoices).lines.map((l) => l.taxRate)).toEqual([19, 0, 19]) // el concepto libre usa la tasa de la empresa
    expect(commandOf(invoices).lines.map((l) => l.tax)).toEqual([190, 0, 798]) // el libro no suma impuesto
    expect(commandOf(invoices).totals.taxTotal).toBe(988)
  })

  it('el cajero puede mandar la tasa explícita si es la que le corresponde a ese producto', async () => {
    const exento = setup({ granted: CASHIER, products: [libro] })
    expect((await exento.service.issue('u1', ORG_ID, input({ lines: [productLine(PAN_ID, 1, { taxRate: 0 })] }))).error).toBe('')

    const propio = setup({ granted: CASHIER, products: [reducido] })
    expect((await propio.service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1, { taxRate: 10 })] }))).error).toBe('')
  })

  it('el cajero no puede cambiar la tasa de un producto, ni a otra ni a la de la empresa', async () => {
    const exento = setup({ granted: CASHIER, products: [libro] })
    expect((await exento.service.issue('u1', ORG_ID, input({ lines: [productLine(PAN_ID, 1, { taxRate: 19 })] }))).error).toBe(
      'Línea 1: no tienes permisos para cambiar el impuesto',
    )
    expect(exento.invoices.issue).not.toHaveBeenCalled()

    const normal = setup({ granted: CASHIER })
    expect((await normal.service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1, { taxRate: 0 })] }))).error).toBe(
      'Línea 1: no tienes permisos para cambiar el impuesto',
    )
  })

  it('quien tiene permiso de ajuste puede cambiar la tasa del producto', async () => {
    const { invoices, service } = setup({ granted: ALL, products: [libro] })
    await service.issue('u1', ORG_ID, input({ lines: [productLine(PAN_ID, 1, { taxRate: 19 })] }))
    expect(commandOf(invoices).lines[0]).toMatchObject({ taxRate: 19, productTaxRate: 0 })
  })
})

describe('InvoiceService.issue · permiso de ajuste (descuentos e impuesto por línea)', () => {
  it('un cajero puede vender a precio de lista con la tasa de la empresa', async () => {
    const { invoices, service } = setup({ granted: CASHIER })
    expect((await service.issue('u1', ORG_ID, input())).error).toBe('')
    expect(commandOf(invoices).lines[0]).toMatchObject({ discount: 0, taxRate: 19 })
  })

  it('un cajero puede mandar la tasa explícita si es la misma de la empresa', async () => {
    const { service } = setup({ granted: CASHIER })
    expect((await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1, { taxRate: 19 })] }))).error).toBe('')
  })

  it('un cajero no puede aplicar descuentos, ni por porcentaje ni por monto', async () => {
    const { invoices, service } = setup({ granted: CASHIER })
    const percent = await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1), productLine(COLA_ID, 1, { discountValue: 5 })] }))
    expect(percent.error).toBe('Línea 2: no tienes permisos para aplicar descuentos')
    const amount = await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1, { discountType: 'amount', discountValue: 100 })] }))
    expect(amount.error).toBe('Línea 1: no tienes permisos para aplicar descuentos')
    expect(invoices.issue).not.toHaveBeenCalled()
  })

  it('un cajero no puede cambiar el impuesto de una línea (por ejemplo, dejarla exenta)', async () => {
    const { invoices, service } = setup({ granted: CASHIER })
    expect((await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1, { taxRate: 0 })] }))).error).toBe(
      'Línea 1: no tienes permisos para cambiar el impuesto',
    )
    expect(invoices.issue).not.toHaveBeenCalled()
  })

  it('la comparación usa la tasa de la empresa, no un 19 fijo', async () => {
    const { service } = setup({ granted: CASHIER, settings: { ...DEFAULT_BILLING_SETTINGS, taxRate: 10 } })
    expect((await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1, { taxRate: 19 })] }))).error).toBe(
      'Línea 1: no tienes permisos para cambiar el impuesto',
    )
  })

  it('quien tiene el permiso de ajuste sí puede', async () => {
    const { invoices, service } = setup({ granted: ALL })
    const result = await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 2, { discountValue: 10, taxRate: 0 })] }))
    expect(result.error).toBe('')
    expect(commandOf(invoices).lines[0]).toMatchObject({ taxRate: 0, discount: 238 })
  })
})

describe('InvoiceService.searchProducts', () => {
  const option = (over: Partial<ProductOption> = {}): ProductOption => ({
    id: COLA_ID, sku: 'COLA', barcode: '7801234567890', name: 'Cola 1L', unit: 'un', price: 1190, taxRate: null, trackStock: true, stock: 8, ...over,
  })

  it('sin permiso de emitir devuelve vacío y no consulta la base', async () => {
    const { invoices, service } = setup({ granted: ['pos.facturacion.read'] })
    expect(await service.searchProducts('u1', ORG_ID, 'cola')).toEqual([])
    expect(invoices.searchProducts).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { invoices, service } = setup()
    expect(await service.searchProducts('u1', OTHER_ORG_ID, 'cola')).toEqual([])
    expect(invoices.searchProducts).not.toHaveBeenCalled()
  })

  it('busca con la empresa autorizada, el texto recortado y un máximo de resultados', async () => {
    const { invoices, service } = setup({ options: [option()] })
    expect(await service.searchProducts('u1', ORG_ID, '  cola  ')).toEqual([option()])
    expect(invoices.searchProducts).toHaveBeenCalledWith(ORG_ID, 'cola', 20)
  })

  it('limita el largo de lo que se busca', async () => {
    const { invoices, service } = setup()
    await service.searchProducts('u1', ORG_ID, 'a'.repeat(500))
    expect(invoices.searchProducts.mock.calls[0][1]).toHaveLength(100)
  })

  it('un texto vacío lista los primeros productos', async () => {
    const { invoices, service } = setup({ options: [option()] })
    expect(await service.searchProducts('u1', ORG_ID, '')).toHaveLength(1)
    expect(invoices.searchProducts).toHaveBeenCalledWith(ORG_ID, '', 20)
  })
})

describe('InvoiceService.issue · cobro al emitir', () => {
  it('"cobrado al emitir" usa el método indicado; si no se indica, efectivo', async () => {
    const withMethod = setup()
    await withMethod.service.issue('u1', ORG_ID, input({ paid: true, paymentMethod: 'transfer' }))
    expect(commandOf(withMethod.invoices)).toMatchObject({ paid: true, paymentMethod: 'transfer' })

    const byDefault = setup()
    await byDefault.service.issue('u1', ORG_ID, input({ paid: true }))
    expect(commandOf(byDefault.invoices)).toMatchObject({ paid: true, paymentMethod: 'cash' })
  })

  it('un documento de total 0 no tiene nada que cobrar: se emite como pagado', async () => {
    const { invoices, service } = setup({ granted: ALL })
    await service.issue('u1', ORG_ID, input({ lines: [productLine(COLA_ID, 1, { discountValue: 100 })] }))
    expect(commandOf(invoices).totals.total).toBe(0)
    expect(commandOf(invoices).paid).toBe(true)
  })

  it('sin marcar el cobro y con total mayor a 0 queda sin cobrar', async () => {
    const { invoices, service } = setup()
    await service.issue('u1', ORG_ID, input())
    expect(commandOf(invoices).paid).toBe(false)
  })
})

const detailFixture: InvoiceDetail = {
  id: INVOICE_ID, documentType: 'invoice', number: 12, status: 'issued', paymentStatus: 'partial', issuedAt: '2026-11-10T15:00:00.000Z',
  dueDate: '2026-12-10', overdue: false, currency: 'CLP', currencyDecimals: 0, taxName: 'IVA', pricesIncludeTax: true,
  customer: { name: 'Ana Pérez', taxId: '12345678-5', email: null, address: null },
  issuer: { legalName: 'Acme SpA', taxId: '76.000.000-1', address: 'Calle 1' },
  subtotal: 2000, discountTotal: 0, taxTotal: 380, total: 2380, paidTotal: 1000, creditTotal: 0, balance: 1380, creditReason: null, relatedInvoice: null, creditNotes: [], notes: null, voidReason: null, voidedAt: null,
  items: [], payments: [],
}

describe('InvoiceService.getDetail', () => {
  it('sin permiso de lectura devuelve null y no consulta la base', async () => {
    const { invoices, service } = setup({ granted: ['pos.facturacion.create'], detail: detailFixture })
    expect(await service.getDetail('u1', ORG_ID, INVOICE_ID)).toBeNull()
    expect(invoices.findDetail).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { invoices, service } = setup({ detail: detailFixture })
    expect(await service.getDetail('u1', OTHER_ORG_ID, INVOICE_ID)).toBeNull()
    expect(invoices.findDetail).not.toHaveBeenCalled()
  })

  it('un documento que no existe devuelve null', async () => {
    const { service } = setup({ detail: undefined })
    expect(await service.getDetail('u1', ORG_ID, INVOICE_ID)).toBeNull()
  })

  it('devuelve el documento y cómo mostrarlo; "hoy" es el de la zona horaria de la empresa', async () => {
    const settings = { ...DEFAULT_BILLING_SETTINGS, locale: 'en-US', documentPrefixes: { invoice: 'FAC', receipt: 'R', sales_note: 'NV', credit_note: 'NC' } }
    const { invoices, service } = setup({ detail: detailFixture, settings, now: new Date('2026-11-10T02:00:00Z') })
    const result = await service.getDetail('u1', ORG_ID, INVOICE_ID)

    expect(result).toEqual({
      detail: detailFixture,
      display: { locale: 'en-US', timezone: 'America/Santiago', documentPrefixes: settings.documentPrefixes },
    })
    expect(invoices.findDetail).toHaveBeenCalledWith(ORG_ID, INVOICE_ID, '2026-11-09') // en Santiago todavía es el 9
  })
})

describe('InvoiceService.addPayment', () => {
  const request = { invoiceId: INVOICE_ID, amount: 1000, method: 'cash' as const, reference: '  ' }
  const added = (over = {}): PaymentOutcome => ({
    status: 'added', paymentStatus: 'partial', paidTotal: 1000, balance: 1380, currency: 'CLP', currencyDecimals: 0, ...over,
  })

  it('sin permiso de emitir no registra nada (anular no basta)', async () => {
    const { invoices, service } = setup({ granted: ['pos.facturacion.void'] })
    expect(await service.addPayment('u1', ORG_ID, request)).toEqual({ error: 'No tienes permisos para registrar cobros', success: '' })
    expect(invoices.addPayment).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { invoices, service } = setup()
    expect((await service.addPayment('u1', OTHER_ORG_ID, request)).error).toBe('No tienes permisos para registrar cobros')
    expect(invoices.addPayment).not.toHaveBeenCalled()
  })

  it('valida el monto, el método y el documento antes de tocar la base', async () => {
    const { invoices, service } = setup()
    expect((await service.addPayment('u1', ORG_ID, { ...request, amount: 0 })).error).toBe('El monto debe ser mayor a 0')
    expect((await service.addPayment('u1', ORG_ID, { ...request, amount: -5 })).error).toBe('El monto debe ser mayor a 0')
    expect((await service.addPayment('u1', ORG_ID, { ...request, amount: NaN })).error).toBe('El monto debe ser un número')
    expect((await service.addPayment('u1', ORG_ID, { ...request, method: 'cripto' as 'cash' })).error).toBe('Método de pago inválido')
    expect((await service.addPayment('u1', ORG_ID, { ...request, invoiceId: 'x' })).error).toBe('Documento inválido')
    expect((await service.addPayment('u1', ORG_ID, { ...request, reference: 'a'.repeat(101) })).error).toBe('La referencia admite máximo 100 caracteres')
    expect(invoices.addPayment).not.toHaveBeenCalled()
  })

  it('registra con el usuario, la hora actual y la referencia vacía como null', async () => {
    const { invoices, service } = setup({ paymentOutcome: added() })
    await service.addPayment('u1', ORG_ID, request)
    expect(invoices.addPayment).toHaveBeenCalledWith(ORG_ID, {
      userId: 'u1', invoiceId: INVOICE_ID, amount: 1000, method: 'cash', reference: null, paidAt: NOW,
    })
    await service.addPayment('u1', ORG_ID, { ...request, reference: ' Transf. 8812 ' })
    expect(invoices.addPayment.mock.calls[1][1].reference).toBe('Transf. 8812')
  })

  it('un cobro parcial informa el saldo pendiente, con el formato de la empresa', async () => {
    const { service } = setup({ paymentOutcome: added() })
    expect(await service.addPayment('u1', ORG_ID, request)).toEqual({ error: '', success: 'Cobro registrado. Saldo pendiente: $1.380' })

    const usd = setup({ settings: { ...DEFAULT_BILLING_SETTINGS, locale: 'en-US' }, paymentOutcome: added({ balance: 12.5, currency: 'USD', currencyDecimals: 2 }) })
    expect((await usd.service.addPayment('u1', ORG_ID, request)).success).toBe('Cobro registrado. Saldo pendiente: $12.50')
  })

  it('el cobro que salda el documento lo dice', async () => {
    const { service } = setup({ paymentOutcome: added({ paymentStatus: 'paid', balance: 0, paidTotal: 2380 }) })
    expect((await service.addPayment('u1', ORG_ID, request)).success).toBe('Cobro registrado: el documento quedó pagado')
  })

  it.each([
    [{ status: 'not_found' }, 'El documento no existe'],
    [{ status: 'not_issued', current: 'void' }, 'El documento está anulado'],
    [{ status: 'not_issued', current: 'draft' }, 'Solo se pueden cobrar documentos emitidos'],
    [{ status: 'settled' }, 'El documento ya está pagado'],
    [{ status: 'credit_note' }, 'Una nota de crédito no recibe cobros'],
    [{ status: 'exceeds_balance', balance: 790, currency: 'CLP', currencyDecimals: 0 }, 'El monto supera el saldo pendiente ($790)'],
    [{ status: 'invalid_amount', currencyDecimals: 0 }, 'El monto debe ser un número entero'],
    [{ status: 'invalid_amount', currencyDecimals: 2 }, 'El monto admite máximo 2 decimales'],
  ] as [PaymentOutcome, string][])('rechazo %j → "%s"', async (paymentOutcome, message) => {
    const { service } = setup({ paymentOutcome })
    expect(await service.addPayment('u1', ORG_ID, request)).toEqual({ error: message, success: '' })
  })
})

describe('InvoiceService.voidPayment', () => {
  const PAYMENT_ID = '99999999-9999-4999-8999-999999999999'
  const request = { paymentId: PAYMENT_ID, reason: '  Monto mal digitado ' }

  it('solo quien puede anular: emitir no basta', async () => {
    const { invoices, service } = setup({ granted: ['pos.facturacion.create'] })
    expect(await service.voidPayment('u1', ORG_ID, request)).toEqual({ error: 'No tienes permisos para anular cobros', success: '' })
    expect(invoices.voidPayment).not.toHaveBeenCalled()
  })

  it('exige un motivo y un cobro válido', async () => {
    const { invoices, service } = setup()
    expect((await service.voidPayment('u1', ORG_ID, { paymentId: PAYMENT_ID, reason: ' ab ' })).error).toBe('Indica el motivo de la anulación')
    expect((await service.voidPayment('u1', ORG_ID, { paymentId: 'x', reason: 'Error' })).error).toBe('Pago inválido')
    expect(invoices.voidPayment).not.toHaveBeenCalled()
  })

  it('anula con el usuario, el motivo recortado y la hora actual', async () => {
    const { invoices, service } = setup({ voidPaymentOutcome: { status: 'voided', invoiceId: INVOICE_ID, paymentStatus: 'unpaid', paidTotal: 0 } })
    expect(await service.voidPayment('u1', ORG_ID, request)).toEqual({ error: '', success: 'Cobro anulado' })
    expect(invoices.voidPayment).toHaveBeenCalledWith(ORG_ID, { userId: 'u1', paymentId: PAYMENT_ID, reason: 'Monto mal digitado', voidedAt: NOW })
  })

  it.each([
    [{ status: 'not_found' }, 'El cobro no existe'],
    [{ status: 'already_voided' }, 'El cobro ya está anulado'],
    [{ status: 'not_issued', current: 'void' }, 'El documento está anulado'],
  ] as [VoidPaymentOutcome, string][])('rechazo %j → "%s"', async (voidPaymentOutcome, message) => {
    const { service } = setup({ voidPaymentOutcome })
    expect(await service.voidPayment('u1', ORG_ID, request)).toEqual({ error: message, success: '' })
  })
})

describe('InvoiceService.issueCreditNote', () => {
  const ITEM_ID = '66666666-6666-4666-8666-666666666666'
  const KEY = '77777777-7777-4777-8777-777777777777'
  const request = { invoiceId: INVOICE_ID, reason: '  Devolución del cliente ', idempotencyKey: KEY, lines: [{ itemId: ITEM_ID, quantity: 1, restock: true }] }
  const note = (over: Partial<IssuedCreditNote> = {}): IssuedCreditNote => ({
    id: 'n1', number: 7, total: 1190, relatedInvoiceId: INVOICE_ID, relatedDocumentType: 'invoice', relatedNumber: 12,
    currency: 'CLP', currencyDecimals: 0, balance: 1190, ...over,
  })
  const issued = (over: Partial<IssuedCreditNote> = {}) => ({ status: 'issued', creditNote: note(over) }) as IssueCreditNoteOutcome

  it('solo quien puede anular: emitir no basta, y otra empresa no tiene acceso', async () => {
    const { invoices, service } = setup({ granted: ['pos.facturacion.create'] })
    expect(await service.issueCreditNote('u1', ORG_ID, request)).toEqual({ error: 'No tienes permisos para emitir notas de crédito', success: '' })
    expect((await setup().service.issueCreditNote('u1', OTHER_ORG_ID, request)).error).toBe('No tienes permisos para emitir notas de crédito')
    expect(invoices.issueCreditNote).not.toHaveBeenCalled()
    expect(invoices.findCreditNoteByIdempotencyKey).not.toHaveBeenCalled()
  })

  it('valida la entrada antes de tocar la base', async () => {
    const { invoices, service } = setup()
    const bad = (over: object) => service.issueCreditNote('u1', ORG_ID, { ...request, ...over } as never)
    expect((await bad({ reason: ' ab ' })).error).toBe('Indica el motivo de la nota de crédito')
    expect((await bad({ reason: 'x'.repeat(201) })).error).toBe('El motivo admite máximo 200 caracteres')
    expect((await bad({ invoiceId: 'x' })).error).toBe('Documento inválido')
    expect((await bad({ idempotencyKey: 'x' })).error).toBe('Clave de solicitud inválida')
    expect((await bad({ lines: [] })).error).toBe('Elige al menos una línea para acreditar')
    expect((await bad({ lines: [{ itemId: 'x', quantity: 1, restock: true }] })).error).toBe('Línea inválida')
    expect((await bad({ lines: [request.lines[0], request.lines[0]] })).error).toBe('Una línea no puede repetirse en la nota')
    expect((await bad({ lines: [{ ...request.lines[0], quantity: '1' }] })).error).toBe('La cantidad debe ser un número')
    expect(invoices.issueCreditNote).not.toHaveBeenCalled()
  })

  it('emite con el usuario, el motivo recortado, los prefijos y la hora actual; no manda montos', async () => {
    const { invoices, service } = setup({ creditOutcome: issued() })
    const result = await service.issueCreditNote('u1', ORG_ID, request)

    expect(result.error).toBe('')
    expect(result.creditNote?.number).toBe(7)
    expect(invoices.issueCreditNote).toHaveBeenCalledWith(ORG_ID, {
      userId: 'u1', invoiceId: INVOICE_ID, idempotencyKey: KEY, reason: 'Devolución del cliente',
      lines: request.lines, documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes, issuedAt: NOW,
    })
  })

  it('informa el saldo: pendiente, sin saldo o a favor del cliente', async () => {
    const pending = await setup({ creditOutcome: issued({ balance: 1190 }) }).service.issueCreditNote('u1', ORG_ID, request)
    expect(pending.success).toMatch(/^Nota de crédito emitida: NC-000007\. Saldo pendiente del documento: .*1\.190\.$/)
    const zero = await setup({ creditOutcome: issued({ balance: 0 }) }).service.issueCreditNote('u1', ORG_ID, request)
    expect(zero.success).toBe('Nota de crédito emitida: NC-000007. El documento queda sin saldo pendiente.')
    const favor = await setup({ creditOutcome: issued({ balance: -1190 }) }).service.issueCreditNote('u1', ORG_ID, request)
    expect(favor.success).toMatch(/^Nota de crédito emitida: NC-000007\. Saldo a favor del cliente: .*1\.190.* \(la devolución del dinero se hace fuera del sistema\)\.$/)
  })

  it('un reintento con la misma clave devuelve la nota ya emitida sin volver a emitir', async () => {
    const { invoices, service } = setup({ creditReplay: note({ number: 3 }) })
    const result = await service.issueCreditNote('u1', ORG_ID, request)
    expect(result.error).toBe('')
    expect(result.success).toContain('NC-000003')
    expect(invoices.findCreditNoteByIdempotencyKey).toHaveBeenCalledWith(ORG_ID, KEY)
    expect(invoices.issueCreditNote).not.toHaveBeenCalled()
  })

  it('una carrera con la misma clave se trata como la nota ya emitida', async () => {
    const result = await setup({ creditOutcome: { status: 'duplicate', creditNote: note({ number: 4 }) } }).service.issueCreditNote('u1', ORG_ID, request)
    expect(result).toMatchObject({ error: '' })
    expect(result.success).toContain('NC-000004')
  })

  it.each([
    [{ status: 'not_found' }, 'El documento no existe'],
    [{ status: 'not_issued', current: 'void' }, 'El documento está anulado'],
    [{ status: 'not_issued', current: 'draft' }, 'Solo se pueden acreditar documentos emitidos'],
    [{ status: 'is_credit_note' }, 'No se puede acreditar una nota de crédito'],
    [{ status: 'line_not_found', index: 1 }, 'Línea 2: no pertenece al documento'],
    [{ status: 'invalid', message: 'Línea 1: solo quedan 2 por acreditar' }, 'Línea 1: solo quedan 2 por acreditar'],
  ] as [IssueCreditNoteOutcome, string][])('rechazo %j → "%s"', async (creditOutcome, message) => {
    const { service } = setup({ creditOutcome })
    expect(await service.issueCreditNote('u1', ORG_ID, request)).toEqual({ error: message, success: '' })
  })
})

describe('InvoiceService.getCreditContext', () => {
  const context = { invoice: { id: INVOICE_ID }, items: [] } as unknown as CreditContext

  it('devuelve el contexto con cómo mostrarlo, solo a quien puede anular', async () => {
    const { invoices, service } = setup({ creditContext: context })
    const view = await service.getCreditContext('u1', ORG_ID, INVOICE_ID)
    expect(view?.context).toBe(context)
    expect(view?.display).toBeDefined()
    expect(invoices.findCreditContext).toHaveBeenCalledWith(ORG_ID, INVOICE_ID)

    expect(await setup({ creditContext: context, granted: ['pos.facturacion.read'] }).service.getCreditContext('u1', ORG_ID, INVOICE_ID)).toBeNull()
    expect(await setup({ creditContext: context }).service.getCreditContext('u1', OTHER_ORG_ID, INVOICE_ID)).toBeNull()
  })

  it('un documento que no se puede acreditar (inexistente, sin emitir o nota) devuelve null', async () => {
    expect(await setup({ creditContext: undefined }).service.getCreditContext('u1', ORG_ID, INVOICE_ID)).toBeNull()
  })
})
