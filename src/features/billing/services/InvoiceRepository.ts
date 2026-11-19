import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { isUniqueViolation } from '@/db/pg-errors'
import {
  invoiceCounters,
  invoiceItems,
  invoicePayments,
  invoices,
  organizations,
  products,
  stockMovements,
} from '@/db/schema'
import { normalizeTaxId } from '@/features/customers/utils/taxId'
import { fromMilli, toMilli } from '@/features/inventory/utils/stockMath'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DiscountType,
  type DocumentType,
  type InvoiceStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '../types/billing'
import type {
  AddPaymentCommand,
  InvoiceDetail,
  InvoiceListRow,
  InvoiceQueryFilters,
  IssueCommand,
  IssuedInvoice,
  IssueOutcome,
  IssuerSnapshot,
  PaymentOutcome,
  ProductOption,
  SaleProduct,
  VoidCommand,
  VoidOutcome,
  VoidPaymentCommand,
  VoidPaymentOutcome,
} from '../types/invoice'
import { toMoneyString } from '../utils/calculateInvoice'
import { formatDocumentNumber } from '../utils/documentNumber'
import { fromMinorUnits, toMinorUnits } from '../utils/minorUnits'
import { paymentStatusFor } from '../utils/paymentStatus'
import { parseNumberSearch } from '../utils/searchTerm'
import { planStockDeductions, type StockRequest } from '../utils/stockPlan'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type Pagination = { page: number; pageSize: number }
export type InvoicePageResult = { rows: InvoiceListRow[]; total: number }

// Escapa los comodines de LIKE para que "50%" busque literalmente "50%".
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

// Regla del módulo: `organizationId` es SIEMPRE el primer parámetro y filtra toda consulta.
export interface IInvoiceRepository {
  /** Productos por id, con su precio y estado reales. Los que no existen en la empresa no vienen. */
  findProducts(organizationId: string, productIds: string[]): Promise<SaleProduct[]>
  /** Productos activos para el buscador: por nombre, SKU o código de barras (el que coincide exacto va primero). */
  searchProducts(organizationId: string, term: string, limit: number): Promise<ProductOption[]>
  /** Datos de la empresa que se copian al documento al emitirlo. */
  findIssuer(organizationId: string): Promise<IssuerSnapshot>
  findByIdempotencyKey(organizationId: string, key: string): Promise<IssuedInvoice | undefined>
  /** Documentos emitidos o anulados (nunca borradores), del más reciente al más antiguo. */
  findPage(organizationId: string, filters: InvoiceQueryFilters, pagination: Pagination): Promise<InvoicePageResult>
  /** Un documento con sus líneas y pagos. `today` (YYYY-MM-DD, zona de la empresa) define si está vencido. */
  findDetail(organizationId: string, invoiceId: string, today: string): Promise<InvoiceDetail | undefined>
  /** Registra un cobro (completo o parcial) y actualiza el estado de pago, en una transacción. */
  addPayment(organizationId: string, command: AddPaymentCommand): Promise<PaymentOutcome>
  /** Anula un cobro (queda quién, cuándo y por qué) y recalcula el estado de pago. */
  voidPayment(organizationId: string, command: VoidPaymentCommand): Promise<VoidPaymentOutcome>
  /**
   * Emite el documento en UNA transacción: bloquea los productos, verifica que nada cambió y que
   * alcanza el stock, toma el siguiente número, guarda documento y líneas y descuenta el stock.
   * Si cualquier paso falla no queda nada guardado (ni número consumido).
   */
  issue(organizationId: string, command: IssueCommand): Promise<IssueOutcome>
  /** Anula un documento emitido y devuelve el stock, en una sola transacción. */
  voidInvoice(organizationId: string, command: VoidCommand): Promise<VoidOutcome>
}

class InvoiceRepository implements IInvoiceRepository {
  async findProducts(organizationId: string, productIds: string[]) {
    if (productIds.length === 0) return []
    const rows = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        unit: products.unit,
        price: products.price,
        taxRate: products.taxRate,
        trackStock: products.trackStock,
        active: products.active,
      })
      .from(products)
      .where(and(eq(products.organizationId, organizationId), inArray(products.id, productIds)))
    return rows.map(
      (row): SaleProduct => ({
        ...row,
        price: Number(row.price),
        taxRate: row.taxRate === null ? null : Number(row.taxRate),
      }),
    )
  }

  async searchProducts(organizationId: string, term: string, limit: number): Promise<ProductOption[]> {
    const search = term.trim()
    const conditions: SQL[] = [eq(products.organizationId, organizationId), eq(products.active, true)]
    if (search) {
      const like = `%${escapeLike(search)}%`
      conditions.push(or(ilike(products.name, like), ilike(products.sku, like), ilike(products.barcode, like))!)
    }

    // Stock actual: suma de movimientos. Solo se usa si el producto lo controla.
    const stock = sql<string>`coalesce((
      select sum(${stockMovements.delta}) from ${stockMovements}
      where ${stockMovements.organizationId} = ${products.organizationId}
        and ${stockMovements.productId} = ${products.id}
    ), 0)`

    // Un código de barras o SKU escrito completo (lector de códigos) debe quedar primero.
    // Sin texto no hay nada que comparar (y Postgres rechaza ordenar por una constante).
    const order = search
      ? [
          desc(sql<boolean>`(lower(${products.barcode}) = lower(${search}) or lower(${products.sku}) = lower(${search}))`),
          asc(products.name),
          asc(products.id),
        ]
      : [asc(products.name), asc(products.id)]

    const rows = await db
      .select({
        id: products.id,
        sku: products.sku,
        barcode: products.barcode,
        name: products.name,
        unit: products.unit,
        price: products.price,
        taxRate: products.taxRate,
        trackStock: products.trackStock,
        stock,
      })
      .from(products)
      .where(and(...conditions))
      .orderBy(...order)
      .limit(limit)

    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      unit: row.unit,
      price: Number(row.price),
      taxRate: row.taxRate === null ? null : Number(row.taxRate),
      trackStock: row.trackStock,
      stock: row.trackStock ? Number(row.stock) : null,
    }))
  }

  async findIssuer(organizationId: string): Promise<IssuerSnapshot> {
    const [row] = await db
      .select({
        name: organizations.name,
        legalName: organizations.legalName,
        taxId: organizations.taxId,
        address: organizations.address,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1)
    if (!row) return { legalName: null, taxId: null, address: null }
    return { legalName: row.legalName ?? row.name, taxId: row.taxId, address: row.address }
  }

  async findByIdempotencyKey(organizationId: string, key: string) {
    const [row] = await db
      .select({
        id: invoices.id,
        number: invoices.number,
        documentType: invoices.documentType,
        total: invoices.total,
      })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.idempotencyKey, key)))
      .limit(1)
    if (!row || row.number === null) return undefined
    return {
      id: row.id,
      number: row.number,
      documentType: row.documentType as DocumentType,
      total: Number(row.total),
    }
  }

  private where(organizationId: string, filters: InvoiceQueryFilters) {
    const conditions: SQL[] = [eq(invoices.organizationId, organizationId), ne(invoices.status, 'draft')]

    if (filters.status === 'issued' || filters.status === 'void') conditions.push(eq(invoices.status, filters.status))
    if (filters.documentType && filters.documentType !== 'all') {
      conditions.push(eq(invoices.documentType, filters.documentType))
    }

    // Cobro: solo cuenta lo emitido (un documento anulado no está "pendiente de pago")
    const payment = filters.payment ?? 'all'
    if (payment !== 'all') {
      conditions.push(eq(invoices.status, 'issued'))
      if (payment === 'overdue') {
        conditions.push(inArray(invoices.paymentStatus, ['unpaid', 'partial']), lt(invoices.dueDate, filters.today))
      } else {
        conditions.push(eq(invoices.paymentStatus, payment))
      }
    }

    // El período son días de calendario de la empresa: la fecha de emisión se mira en su zona horaria
    if (filters.from) {
      conditions.push(sql`(timezone(${filters.timezone}, ${invoices.issuedAt}))::date >= ${filters.from}::date`)
    }
    if (filters.to) {
      conditions.push(sql`(timezone(${filters.timezone}, ${invoices.issuedAt}))::date <= ${filters.to}::date`)
    }

    const search = filters.search?.trim()
    if (search) {
      const matches: SQL[] = [ilike(invoices.customerName, `%${escapeLike(search)}%`)]
      // El RUT se guarda sin puntos ni espacios: "76.123" debe encontrar "76123456-7"
      const taxTerm = normalizeTaxId(search)
      if (taxTerm) matches.push(ilike(invoices.customerTaxId, `%${escapeLike(taxTerm)}%`))
      // "F-000012" busca esa factura; "12" (sin prefijo) busca ese número en cualquier tipo de documento.
      // Un prefijo que la empresa no usa ("X-12") no busca por número: puede ser parte de un nombre.
      const numberSearch = parseNumberSearch(search)
      if (numberSearch) {
        if (numberSearch.prefix === '') {
          matches.push(eq(invoices.number, numberSearch.number))
        } else {
          const type = DOCUMENT_TYPES.find(
            (candidate) => filters.documentPrefixes[candidate].toUpperCase() === numberSearch.prefix,
          )
          if (type) matches.push(and(eq(invoices.documentType, type), eq(invoices.number, numberSearch.number))!)
        }
      }
      conditions.push(or(...matches)!)
    }

    return and(...conditions)
  }

  async findPage(organizationId: string, filters: InvoiceQueryFilters, pagination: Pagination) {
    const where = this.where(organizationId, filters)

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: invoices.id,
          documentType: invoices.documentType,
          number: invoices.number,
          status: invoices.status,
          paymentStatus: invoices.paymentStatus,
          customerName: invoices.customerName,
          customerTaxId: invoices.customerTaxId,
          total: invoices.total,
          paidTotal: invoices.paidTotal,
          currency: invoices.currency,
          currencyDecimals: invoices.currencyDecimals,
          issuedAt: invoices.issuedAt,
          dueDate: invoices.dueDate,
          voidReason: invoices.voidReason,
        })
        .from(invoices)
        .where(where)
        .orderBy(desc(invoices.createdAt), desc(invoices.id)) // el id desempata: la paginación no repite ni salta filas
        .limit(pagination.pageSize)
        .offset((pagination.page - 1) * pagination.pageSize),
      db.select({ total: count() }).from(invoices).where(where),
    ])

    return {
      rows: rows.map(
        (row): InvoiceListRow => ({
          id: row.id,
          documentType: row.documentType as DocumentType,
          number: row.number as number, // los documentos no borrador siempre tienen número (CHECK en la base)
          status: row.status as InvoiceStatus,
          paymentStatus: row.paymentStatus as PaymentStatus,
          customerName: row.customerName,
          customerTaxId: row.customerTaxId,
          total: Number(row.total),
          paidTotal: Number(row.paidTotal),
          currency: row.currency,
          currencyDecimals: row.currencyDecimals,
          issuedAt: (row.issuedAt as Date).toISOString(),
          dueDate: row.dueDate,
          overdue:
            row.status === 'issued' &&
            row.paymentStatus !== 'paid' &&
            row.dueDate !== null &&
            row.dueDate < filters.today,
          voidReason: row.voidReason,
        }),
      ),
      total,
    }
  }

  async findDetail(organizationId: string, invoiceId: string, today: string): Promise<InvoiceDetail | undefined> {
    const [row] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, invoiceId)))
      .limit(1)
    // Un borrador no se muestra: solo documentos emitidos o anulados (tienen número)
    if (!row || row.status === 'draft' || row.number === null || row.issuedAt === null) return undefined

    const [items, payments] = await Promise.all([
      db
        .select()
        .from(invoiceItems)
        .where(and(eq(invoiceItems.organizationId, organizationId), eq(invoiceItems.invoiceId, row.id)))
        .orderBy(asc(invoiceItems.position)),
      db
        .select()
        .from(invoicePayments)
        .where(and(eq(invoicePayments.organizationId, organizationId), eq(invoicePayments.invoiceId, row.id)))
        .orderBy(asc(invoicePayments.paidAt), asc(invoicePayments.createdAt)),
    ])

    const decimals = row.currencyDecimals
    const total = Number(row.total)
    const paidTotal = Number(row.paidTotal)
    const balanceMinor = (toMinorUnits(total, decimals) ?? 0) - (toMinorUnits(paidTotal, decimals) ?? 0)

    return {
      id: row.id,
      documentType: row.documentType as DocumentType,
      number: row.number,
      status: row.status as InvoiceStatus,
      paymentStatus: row.paymentStatus as PaymentStatus,
      issuedAt: row.issuedAt.toISOString(),
      dueDate: row.dueDate,
      overdue: row.status === 'issued' && row.paymentStatus !== 'paid' && row.dueDate !== null && row.dueDate < today,
      currency: row.currency,
      currencyDecimals: decimals,
      taxName: row.taxName,
      pricesIncludeTax: row.pricesIncludeTax,
      customer: row.customerName
        ? { name: row.customerName, taxId: row.customerTaxId, email: row.customerEmail, address: row.customerAddress }
        : null,
      issuer: { legalName: row.issuerLegalName, taxId: row.issuerTaxId, address: row.issuerAddress },
      subtotal: Number(row.subtotal),
      discountTotal: Number(row.discountTotal),
      taxTotal: Number(row.taxTotal),
      total,
      paidTotal,
      balance: fromMinorUnits(balanceMinor, decimals),
      notes: row.notes,
      voidReason: row.voidReason,
      voidedAt: row.voidedAt?.toISOString() ?? null,
      items: items.map((item) => ({
        position: item.position,
        productId: item.productId,
        sku: item.sku,
        description: item.description,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountType: item.discountType as DiscountType,
        discountValue: Number(item.discountValue),
        taxRate: Number(item.taxRate),
        lineGross: Number(item.lineGross),
        lineDiscount: Number(item.lineDiscount),
        lineNet: Number(item.lineNet),
        lineTax: Number(item.lineTax),
        lineTotal: Number(item.lineTotal),
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method as PaymentMethod,
        reference: payment.reference,
        paidAt: payment.paidAt.toISOString(),
        voidedAt: payment.voidedAt?.toISOString() ?? null,
        voidReason: payment.voidReason,
      })),
    }
  }

  async addPayment(organizationId: string, command: AddPaymentCommand): Promise<PaymentOutcome> {
    return db.transaction(async (tx): Promise<PaymentOutcome> => {
      // FOR UPDATE: dos cobros simultáneos del mismo documento se ejecutan uno detrás de otro,
      // así el segundo ve el saldo ya descontado y nunca se cobra de más
      const [invoice] = await tx
        .select({
          id: invoices.id,
          status: invoices.status,
          total: invoices.total,
          paidTotal: invoices.paidTotal,
          currency: invoices.currency,
          currencyDecimals: invoices.currencyDecimals,
        })
        .from(invoices)
        .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, command.invoiceId)))
        .for('update')
      if (!invoice) return { status: 'not_found' }
      if (invoice.status !== 'issued') return { status: 'not_issued', current: invoice.status as InvoiceStatus }

      const decimals = invoice.currencyDecimals
      const amountMinor = toMinorUnits(command.amount, decimals)
      if (amountMinor === null || amountMinor <= 0) return { status: 'invalid_amount', currencyDecimals: decimals }

      const totalMinor = toMinorUnits(Number(invoice.total), decimals) ?? 0
      const paidMinor = toMinorUnits(Number(invoice.paidTotal), decimals) ?? 0
      const balanceMinor = totalMinor - paidMinor
      if (balanceMinor <= 0) return { status: 'settled' }
      if (amountMinor > balanceMinor) {
        return {
          status: 'exceeds_balance',
          balance: fromMinorUnits(balanceMinor, decimals),
          currency: invoice.currency,
          currencyDecimals: decimals,
        }
      }

      await tx.insert(invoicePayments).values({
        organizationId,
        invoiceId: invoice.id,
        amount: toMoneyString(fromMinorUnits(amountMinor, decimals)),
        method: command.method,
        reference: command.reference,
        paidAt: command.paidAt,
        createdBy: command.userId,
      })

      const newPaidMinor = paidMinor + amountMinor
      const paymentStatus = paymentStatusFor(newPaidMinor, totalMinor)
      await tx
        .update(invoices)
        .set({
          paidTotal: toMoneyString(fromMinorUnits(newPaidMinor, decimals)),
          paymentStatus,
          paidAt: paymentStatus === 'paid' ? command.paidAt : null,
          updatedAt: command.paidAt,
        })
        .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, invoice.id)))

      return {
        status: 'added',
        paymentStatus,
        paidTotal: fromMinorUnits(newPaidMinor, decimals),
        balance: fromMinorUnits(totalMinor - newPaidMinor, decimals),
        currency: invoice.currency,
        currencyDecimals: decimals,
      }
    })
  }

  async voidPayment(organizationId: string, command: VoidPaymentCommand): Promise<VoidPaymentOutcome> {
    return db.transaction(async (tx): Promise<VoidPaymentOutcome> => {
      const [found] = await tx
        .select({ invoiceId: invoicePayments.invoiceId })
        .from(invoicePayments)
        .where(and(eq(invoicePayments.organizationId, organizationId), eq(invoicePayments.id, command.paymentId)))
      if (!found) return { status: 'not_found' }

      // Se bloquea el documento y recién entonces se vuelve a leer el pago: así dos anulaciones
      // simultáneas del mismo pago no lo descuentan dos veces
      const [invoice] = await tx
        .select({ id: invoices.id, status: invoices.status, total: invoices.total, currencyDecimals: invoices.currencyDecimals })
        .from(invoices)
        .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, found.invoiceId)))
        .for('update')
      if (!invoice) return { status: 'not_found' }

      const [payment] = await tx
        .select({ voidedAt: invoicePayments.voidedAt })
        .from(invoicePayments)
        .where(and(eq(invoicePayments.organizationId, organizationId), eq(invoicePayments.id, command.paymentId)))
      if (!payment) return { status: 'not_found' }
      if (payment.voidedAt) return { status: 'already_voided' }
      if (invoice.status !== 'issued') return { status: 'not_issued', current: invoice.status as InvoiceStatus }

      await tx
        .update(invoicePayments)
        .set({ voidedAt: command.voidedAt, voidedBy: command.userId, voidReason: command.reason })
        .where(and(eq(invoicePayments.organizationId, organizationId), eq(invoicePayments.id, command.paymentId)))

      // Lo cobrado es la suma de los pagos vigentes
      const [{ remaining }] = await tx
        .select({ remaining: sql<string>`coalesce(sum(${invoicePayments.amount}), 0)` })
        .from(invoicePayments)
        .where(
          and(
            eq(invoicePayments.organizationId, organizationId),
            eq(invoicePayments.invoiceId, invoice.id),
            isNull(invoicePayments.voidedAt),
          ),
        )

      const decimals = invoice.currencyDecimals
      const paidMinor = toMinorUnits(Number(remaining), decimals) ?? 0
      const totalMinor = toMinorUnits(Number(invoice.total), decimals) ?? 0
      const paymentStatus = paymentStatusFor(paidMinor, totalMinor)

      await tx
        .update(invoices)
        .set({
          paidTotal: toMoneyString(fromMinorUnits(paidMinor, decimals)),
          paymentStatus,
          paidAt: null, // al anular un cobro el documento deja de estar saldado
          updatedAt: command.voidedAt,
        })
        .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, invoice.id)))

      return {
        status: 'voided',
        invoiceId: invoice.id,
        paymentStatus,
        paidTotal: fromMinorUnits(paidMinor, decimals),
      }
    })
  }

  async issue(organizationId: string, command: IssueCommand): Promise<IssueOutcome> {
    try {
      return await db.transaction((tx) => this.issueInTransaction(tx, organizationId, command))
    } catch (error) {
      // Dos solicitudes simultáneas con la misma clave: gana una, la otra recibe el documento ya emitido
      if (isUniqueViolation(error, 'idempotency')) {
        const invoice = await this.findByIdempotencyKey(organizationId, command.idempotencyKey)
        if (invoice) return { status: 'duplicate', invoice }
      }
      throw error
    }
  }

  private async issueInTransaction(
    tx: Tx,
    organizationId: string,
    command: IssueCommand,
  ): Promise<IssueOutcome> {
    // 1) Bloquea los productos (en orden de id, para que dos facturas no se bloqueen entre sí) y
    //    verifica que siguen como cuando se prepararon: mismo precio, activos, mismo control de stock.
    const productIds = [
      ...new Set(command.lines.flatMap((line) => (line.productId ? [line.productId] : []))),
    ].sort()

    const locked = new Map<string, { price: string; taxRate: string | null; trackStock: boolean; active: boolean }>()
    if (productIds.length > 0) {
      const rows = await tx
        .select({
          id: products.id,
          price: products.price,
          taxRate: products.taxRate,
          trackStock: products.trackStock,
          active: products.active,
        })
        .from(products)
        .where(and(eq(products.organizationId, organizationId), inArray(products.id, productIds)))
        .orderBy(asc(products.id))
        .for('update')
      for (const row of rows) locked.set(row.id, row)
    }

    for (const line of command.lines) {
      if (!line.productId) continue
      const product = locked.get(line.productId)
      const changed =
        !product ||
        !product.active ||
        product.trackStock !== line.tracksStock ||
        toMilli(product.price) !== toMilli(line.unitPrice) ||
        (product.taxRate === null ? null : Number(product.taxRate)) !== line.productTaxRate
      if (changed) return { status: 'product_changed', productName: line.description }
    }

    // 2) Stock real (con los productos bloqueados nadie más lo mueve) y plan de descuento
    const requests: StockRequest[] = command.lines
      .filter((line) => line.tracksStock && line.productId)
      .map((line) => ({
        productId: line.productId as string,
        name: line.description,
        unit: line.unit,
        quantity: line.quantity,
      }))

    let deductions: { productId: string; milli: number }[] = []
    if (requests.length > 0) {
      const trackedIds = [...new Set(requests.map((request) => request.productId))]
      const rows = await tx
        .select({
          productId: stockMovements.productId,
          total: sql<string>`coalesce(sum(${stockMovements.delta}), 0)`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.organizationId, organizationId),
            inArray(stockMovements.productId, trackedIds),
          ),
        )
        .groupBy(stockMovements.productId)

      const plan = planStockDeductions(
        requests,
        new Map(rows.map((row) => [row.productId, row.total])),
        command.allowNegativeStock,
      )
      if (!plan.ok) return { status: 'insufficient_stock', shortages: plan.shortages }
      deductions = plan.deductions
    }

    // 3) Siguiente número. Va dentro de la transacción: si algo falla después, el número no se consume.
    const [counter] = await tx
      .insert(invoiceCounters)
      .values({ organizationId, documentType: command.documentType, lastNumber: 1 })
      .onConflictDoUpdate({
        target: [invoiceCounters.organizationId, invoiceCounters.documentType],
        set: { lastNumber: sql`${invoiceCounters.lastNumber} + 1` },
      })
      .returning({ number: invoiceCounters.lastNumber })
    const number = counter.number

    // 4) Documento en borrador + líneas (la base solo deja escribir líneas mientras es borrador)
    const { totals, customer, issuer } = command
    const [created] = await tx
      .insert(invoices)
      .values({
        organizationId,
        documentType: command.documentType,
        status: 'draft',
        paymentStatus: command.paid ? 'paid' : 'unpaid',
        paidAt: command.paid ? command.issuedAt : null,
        paidTotal: command.paid ? toMoneyString(totals.total) : '0',
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerTaxId: customer?.taxId ?? null,
        customerEmail: customer?.email ?? null,
        customerAddress: customer?.address ?? null,
        issuerLegalName: issuer.legalName,
        issuerTaxId: issuer.taxId,
        issuerAddress: issuer.address,
        currency: command.currency,
        currencyDecimals: command.currencyDecimals,
        taxName: command.taxName,
        pricesIncludeTax: command.pricesIncludeTax,
        dueDate: command.dueDate,
        subtotal: toMoneyString(totals.subtotal),
        discountTotal: toMoneyString(totals.discountTotal),
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(totals.total),
        notes: command.notes,
        idempotencyKey: command.idempotencyKey,
        createdBy: command.userId,
      })
      .returning({ id: invoices.id })

    await tx.insert(invoiceItems).values(
      command.lines.map((line) => ({
        organizationId,
        invoiceId: created.id,
        position: line.position,
        productId: line.productId,
        sku: line.sku,
        description: line.description,
        unit: line.unit,
        quantity: fromMilli(toMilli(line.quantity)),
        unitPrice: toMoneyString(line.unitPrice),
        discountType: line.discountType,
        discountValue: toMoneyString(line.discountValue),
        taxRate: line.taxRate.toFixed(2),
        tracksStock: line.tracksStock,
        lineGross: toMoneyString(line.gross),
        lineDiscount: toMoneyString(line.discount),
        lineNet: toMoneyString(line.net),
        lineTax: toMoneyString(line.tax),
        lineTotal: toMoneyString(line.total),
      })),
    )

    // 5) Stock: un movimiento por producto, ligado al documento
    if (deductions.length > 0) {
      const label = `${DOCUMENT_TYPE_LABELS[command.documentType]} ${formatDocumentNumber(
        command.documentPrefixes,
        command.documentType,
        number,
      )}`
      await tx.insert(stockMovements).values(
        deductions.map((deduction) => ({
          organizationId,
          productId: deduction.productId,
          type: 'sale',
          delta: fromMilli(-deduction.milli),
          reason: label,
          referenceType: 'invoice',
          referenceId: created.id,
          createdBy: command.userId,
        })),
      )
    }

    // 6) Emitir: asigna el número y congela el documento
    await tx
      .update(invoices)
      .set({
        status: 'issued',
        number,
        issuedAt: command.issuedAt,
        issuedBy: command.userId,
        updatedAt: command.issuedAt,
      })
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, created.id)))

    // Cobrado al emitir: queda registrado como un pago (el documento ya está emitido, que es lo que exige la base)
    if (command.paid && totals.total > 0) {
      await tx.insert(invoicePayments).values({
        organizationId,
        invoiceId: created.id,
        amount: toMoneyString(totals.total),
        method: command.paymentMethod,
        reference: null,
        paidAt: command.issuedAt,
        createdBy: command.userId,
      })
    }

    return {
      status: 'issued',
      invoice: { id: created.id, number, documentType: command.documentType, total: totals.total },
    }
  }

  async voidInvoice(organizationId: string, command: VoidCommand): Promise<VoidOutcome> {
    return db.transaction(async (tx): Promise<VoidOutcome> => {
      // FOR UPDATE: dos anulaciones simultáneas se ejecutan una detrás de otra; la segunda ya lo ve anulado
      const [invoice] = await tx
        .select({
          id: invoices.id,
          status: invoices.status,
          number: invoices.number,
          documentType: invoices.documentType,
        })
        .from(invoices)
        .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, command.invoiceId)))
        .for('update')
      if (!invoice) return { status: 'not_found' }
      if (invoice.status !== 'issued' || invoice.number === null) {
        return { status: 'not_issued', current: invoice.status as InvoiceStatus }
      }

      const documentType = invoice.documentType as DocumentType

      // Devuelve exactamente lo que se descontó: las líneas con stock controlado, sumadas por producto
      const items = await tx
        .select({ productId: invoiceItems.productId, quantity: invoiceItems.quantity })
        .from(invoiceItems)
        .where(
          and(
            eq(invoiceItems.organizationId, organizationId),
            eq(invoiceItems.invoiceId, invoice.id),
            eq(invoiceItems.tracksStock, true),
          ),
        )

      const returned = new Map<string, number>()
      for (const item of items) {
        if (!item.productId) continue
        returned.set(item.productId, (returned.get(item.productId) ?? 0) + toMilli(item.quantity))
      }

      if (returned.size > 0) {
        const label = `Anulación ${DOCUMENT_TYPE_LABELS[documentType]} ${formatDocumentNumber(
          command.documentPrefixes,
          documentType,
          invoice.number,
        )}`
        await tx.insert(stockMovements).values(
          [...returned.entries()].map(([productId, milli]) => ({
            organizationId,
            productId,
            type: 'sale_void',
            delta: fromMilli(milli),
            reason: label,
            referenceType: 'invoice',
            referenceId: invoice.id,
            createdBy: command.userId,
          })),
        )
      }

      // Los cobros vigentes quedan anulados junto con el documento (con su motivo, para el registro)
      await tx
        .update(invoicePayments)
        .set({
          voidedAt: command.voidedAt,
          voidedBy: command.userId,
          voidReason: `Por anulación del documento (${command.reason})`,
        })
        .where(
          and(
            eq(invoicePayments.organizationId, organizationId),
            eq(invoicePayments.invoiceId, invoice.id),
            isNull(invoicePayments.voidedAt),
          ),
        )

      await tx
        .update(invoices)
        .set({
          status: 'void',
          voidedAt: command.voidedAt,
          voidedBy: command.userId,
          voidReason: command.reason,
          paymentStatus: 'unpaid', // un documento anulado no tiene estado de cobro
          paidTotal: '0',
          paidAt: null,
          updatedAt: command.voidedAt,
        })
        .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, invoice.id)))

      return {
        status: 'voided',
        invoice: { id: invoice.id, number: invoice.number, documentType },
      }
    })
  }
}

export const invoiceRepository = new InvoiceRepository()
