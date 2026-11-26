import 'server-only'
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { db } from '@/db'
import {
  invoiceItems,
  invoicePayments,
  invoices,
  organizations,
  products,
  stockMovements,
} from '@/db/schema'
import { normalizeTaxId } from '@/features/customers/utils/taxId'
import {
  CREDIT_NOTE_TYPE,
  DOCUMENT_TYPES,
  type AnyDocumentType,
  type DiscountType,
  type DocumentType,
  type InvoiceStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '../../types/billing'
import type {
  InvoiceDetail,
  InvoiceListRow,
  InvoiceQueryFilters,
  IssuerSnapshot,
  ProductOption,
  SaleProduct,
} from '../../types/invoice'
import { documentPrefix } from '../../utils/documentNumber'
import { fromMinorUnits, toMinorUnits } from '../../utils/minorUnits'
import { parseNumberSearch } from '../../utils/searchTerm'
import { escapeLike } from './shared'
import type { Pagination } from './shared'

// Consultas de documentos: productos para vender, listado paginado, detalle y búsqueda por clave de idempotencia. Solo lectura.
export class InvoiceQueries {
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
      conditions.push(eq(invoices.status, 'issued'), ne(invoices.documentType, 'credit_note')) // una nota no se cobra
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
          const type = ([...DOCUMENT_TYPES, CREDIT_NOTE_TYPE] as AnyDocumentType[]).find(
            (candidate) => documentPrefix(filters.documentPrefixes, candidate).toUpperCase() === numberSearch.prefix,
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
          creditTotal: invoices.creditTotal,
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
          documentType: row.documentType as AnyDocumentType,
          number: row.number as number, // los documentos no borrador siempre tienen número (CHECK en la base)
          status: row.status as InvoiceStatus,
          paymentStatus: row.paymentStatus as PaymentStatus,
          customerName: row.customerName,
          customerTaxId: row.customerTaxId,
          total: Number(row.total),
          paidTotal: Number(row.paidTotal),
          creditTotal: Number(row.creditTotal),
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
    const creditTotal = Number(row.creditTotal)
    const isCreditNote = row.documentType === 'credit_note'
    // Saldo = total − acreditado − cobrado (negativo: a favor del cliente). Una nota de crédito no tiene saldo.
    const balanceMinor = isCreditNote
      ? 0
      : (toMinorUnits(total, decimals) ?? 0) -
        (toMinorUnits(creditTotal, decimals) ?? 0) -
        (toMinorUnits(paidTotal, decimals) ?? 0)

    const [related] =
      isCreditNote && row.relatedInvoiceId
        ? await db
            .select({ id: invoices.id, documentType: invoices.documentType, number: invoices.number })
            .from(invoices)
            .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, row.relatedInvoiceId)))
            .limit(1)
        : []
    const notes = isCreditNote
      ? []
      : await db
          .select({ id: invoices.id, number: invoices.number, total: invoices.total, issuedAt: invoices.issuedAt })
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, organizationId),
              eq(invoices.relatedInvoiceId, row.id),
              eq(invoices.status, 'issued'),
            ),
          )
          .orderBy(asc(invoices.number))

    return {
      id: row.id,
      documentType: row.documentType as AnyDocumentType,
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
      creditTotal,
      balance: fromMinorUnits(balanceMinor, decimals),
      creditReason: row.creditReason,
      relatedInvoice: related
        ? { id: related.id, documentType: related.documentType as DocumentType, number: related.number as number }
        : null,
      creditNotes: notes.map((note) => ({
        id: note.id,
        number: note.number as number,
        total: Number(note.total),
        issuedAt: (note.issuedAt as Date).toISOString(),
      })),
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
}
