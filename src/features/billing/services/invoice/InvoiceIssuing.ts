import 'server-only'
import {
  and,
  asc,
  eq,
  inArray,
  sql,
} from 'drizzle-orm'
import { db } from '@/db'
import { isUniqueViolation } from '@/db/pg-errors'
import {
  invoiceCounters,
  invoiceItems,
  invoicePayments,
  invoices,
  products,
  stockMovements,
} from '@/db/schema'
import { fromMilli, toMilli } from '@/features/inventory/utils/stockMath'
import { DOCUMENT_TYPE_LABELS } from '../../types/billing'
import type { IssueCommand, IssueOutcome } from '../../types/invoice'
import { toMoneyString } from '../../utils/calculateInvoice'
import { formatDocumentNumber } from '../../utils/documentNumber'
import { planStockDeductions, type StockRequest } from '../../utils/stockPlan'
import type { Tx } from './shared'
import type { InvoiceQueries } from './InvoiceQueries'

// Emisión de documentos (factura, recibo, nota de venta) en UNA transacción: bloquea productos, toma el número y descuenta stock.
export class InvoiceIssuing {
  constructor(private readonly queries: Pick<InvoiceQueries, 'findByIdempotencyKey'>) {}

  async issue(organizationId: string, command: IssueCommand): Promise<IssueOutcome> {
    try {
      return await db.transaction((tx) => this.issueInTransaction(tx, organizationId, command))
    } catch (error) {
      // Dos solicitudes simultáneas con la misma clave: gana una, la otra recibe el documento ya emitido
      if (isUniqueViolation(error, 'idempotency')) {
        const invoice = await this.queries.findByIdempotencyKey(organizationId, command.idempotencyKey)
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

  // ---------- Notas de crédito ----------
}
