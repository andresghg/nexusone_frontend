import 'server-only'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { isUniqueViolation } from '@/db/pg-errors'
import { invoiceCounters, invoiceItems, invoices, stockMovements } from '@/db/schema'
import { fromMilli, toMilli } from '@/features/inventory/utils/stockMath'
import { ANY_DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_LABELS, type DocumentType, type InvoiceStatus } from '../../types/billing'
import type {
  CreditableItem,
  CreditContext,
  IssueCreditNoteCommand,
  IssueCreditNoteOutcome,
  IssuedCreditNote,
} from '../../types/invoice'
import { calculateCreditNote, type CreditSourceLine } from '../../utils/calculateCreditNote'
import { toMoneyString } from '../../utils/calculateInvoice'
import { planRestock } from '../../utils/creditNoteStock'
import { formatDocumentNumber } from '../../utils/documentNumber'
import { fromMinorUnits, toMinorUnits } from '../../utils/minorUnits'
import { paymentStatusFor } from '../../utils/paymentStatus'
import type { Tx } from './shared'

// Notas de crédito: contexto de lo acreditable, emisión en UNA transacción y consulta por clave de idempotencia.
export class CreditNotes {
  /** Lo ya acreditado por línea: suma de las notas EMITIDAS que apuntan al documento. */
  private async creditedByItem(tx: Tx | typeof db, organizationId: string, invoiceId: string) {
    const rows = await tx
      .select({
        itemId: invoiceItems.relatedItemId,
        quantity: sql<string>`coalesce(sum(${invoiceItems.quantity}), 0)`,
        gross: sql<string>`coalesce(sum(${invoiceItems.lineGross}), 0)`,
        discount: sql<string>`coalesce(sum(${invoiceItems.lineDiscount}), 0)`,
        net: sql<string>`coalesce(sum(${invoiceItems.lineNet}), 0)`,
        tax: sql<string>`coalesce(sum(${invoiceItems.lineTax}), 0)`,
        total: sql<string>`coalesce(sum(${invoiceItems.lineTotal}), 0)`,
      })
      .from(invoiceItems)
      .innerJoin(
        invoices,
        and(eq(invoices.organizationId, invoiceItems.organizationId), eq(invoices.id, invoiceItems.invoiceId)),
      )
      .where(
        and(
          eq(invoiceItems.organizationId, organizationId),
          eq(invoices.relatedInvoiceId, invoiceId),
          eq(invoices.status, 'issued'),
        ),
      )
      .groupBy(invoiceItems.relatedItemId)
    return new Map(
      rows.flatMap((row) =>
        row.itemId === null
          ? []
          : [
              [
                row.itemId,
                {
                  quantity: Number(row.quantity),
                  gross: Number(row.gross),
                  discount: Number(row.discount),
                  net: Number(row.net),
                  tax: Number(row.tax),
                  total: Number(row.total),
                },
              ] as const,
            ],
      ),
    )
  }

  async findCreditContext(organizationId: string, invoiceId: string): Promise<CreditContext | undefined> {
    const [row] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, invoiceId)))
      .limit(1)
    if (!row || row.status !== 'issued' || row.number === null || row.documentType === 'credit_note') return undefined

    const [items, credited] = await Promise.all([
      db
        .select()
        .from(invoiceItems)
        .where(and(eq(invoiceItems.organizationId, organizationId), eq(invoiceItems.invoiceId, row.id)))
        .orderBy(asc(invoiceItems.position)),
      this.creditedByItem(db, organizationId, row.id),
    ])

    const decimals = row.currencyDecimals
    const minor = (value: number) => toMinorUnits(value, decimals) ?? 0
    const balanceMinor = minor(Number(row.total)) - minor(Number(row.creditTotal)) - minor(Number(row.paidTotal))

    return {
      invoice: {
        id: row.id,
        documentType: row.documentType as DocumentType,
        number: row.number,
        currency: row.currency,
        currencyDecimals: decimals,
        taxName: row.taxName,
        pricesIncludeTax: row.pricesIncludeTax,
        total: Number(row.total),
        creditTotal: Number(row.creditTotal),
        paidTotal: Number(row.paidTotal),
        balance: fromMinorUnits(balanceMinor, decimals),
      },
      items: items.map((item): CreditableItem => {
        const done = credited.get(item.id)
        const quantity = Number(item.quantity)
        const creditedQuantity = done?.quantity ?? 0
        const lineTotal = Number(item.lineTotal)
        const creditedTotal = done?.total ?? 0
        return {
          itemId: item.id,
          position: item.position,
          productId: item.productId,
          sku: item.sku,
          description: item.description,
          unit: item.unit,
          taxRate: Number(item.taxRate),
          tracksStock: item.tracksStock,
          quantity,
          creditedQuantity,
          remainingQuantity: (toMilli(quantity) - toMilli(creditedQuantity)) / 1000,
          lineTotal,
          creditedTotal,
          remainingTotal: fromMinorUnits(minor(lineTotal) - minor(creditedTotal), decimals),
          source: {
            quantity,
            taxRate: Number(item.taxRate),
            original: {
              gross: Number(item.lineGross),
              discount: Number(item.lineDiscount),
              net: Number(item.lineNet),
              tax: Number(item.lineTax),
              total: lineTotal,
            },
            credited: done ?? { quantity: 0, gross: 0, discount: 0, net: 0, tax: 0, total: 0 },
          },
        }
      }),
    }
  }

  async findCreditNoteByIdempotencyKey(organizationId: string, key: string): Promise<IssuedCreditNote | undefined> {
    const [row] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.idempotencyKey, key),
          eq(invoices.documentType, 'credit_note'),
          eq(invoices.status, 'issued'),
        ),
      )
      .limit(1)
    return row ? this.creditNoteSummary(db, organizationId, row.id) : undefined
  }

  private async creditNoteSummary(tx: Tx | typeof db, organizationId: string, noteId: string) {
    const [note] = await tx
      .select({
        id: invoices.id,
        number: invoices.number,
        total: invoices.total,
        relatedInvoiceId: invoices.relatedInvoiceId,
        currency: invoices.currency,
        currencyDecimals: invoices.currencyDecimals,
      })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, noteId)))
      .limit(1)
    if (!note || note.number === null || note.relatedInvoiceId === null) return undefined
    const [original] = await tx
      .select({
        documentType: invoices.documentType,
        number: invoices.number,
        total: invoices.total,
        creditTotal: invoices.creditTotal,
        paidTotal: invoices.paidTotal,
      })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, note.relatedInvoiceId)))
      .limit(1)
    if (!original || original.number === null) return undefined

    const decimals = note.currencyDecimals
    const minor = (value: string) => toMinorUnits(Number(value), decimals) ?? 0
    const balanceMinor = minor(original.total) - minor(original.creditTotal) - minor(original.paidTotal)
    const summary: IssuedCreditNote = {
      id: note.id,
      number: note.number,
      total: Number(note.total),
      relatedInvoiceId: note.relatedInvoiceId,
      relatedDocumentType: original.documentType as DocumentType,
      relatedNumber: original.number,
      currency: note.currency,
      currencyDecimals: decimals,
      balance: fromMinorUnits(balanceMinor, decimals),
    }
    return summary
  }

  async issueCreditNote(organizationId: string, command: IssueCreditNoteCommand): Promise<IssueCreditNoteOutcome> {
    try {
      return await db.transaction((tx) => this.issueCreditNoteInTransaction(tx, organizationId, command))
    } catch (error) {
      // Dos solicitudes simultáneas con la misma clave: gana una, la otra recibe la nota ya emitida
      if (isUniqueViolation(error, 'idempotency')) {
        const creditNote = await this.findCreditNoteByIdempotencyKey(organizationId, command.idempotencyKey)
        if (creditNote) return { status: 'duplicate', creditNote }
      }
      throw error
    }
  }

  private async issueCreditNoteInTransaction(
    tx: Tx,
    organizationId: string,
    command: IssueCreditNoteCommand,
  ): Promise<IssueCreditNoteOutcome> {
    // 1) Bloquea el documento original: dos notas (o un cobro) sobre él se ejecutan una detrás de otra,
    //    así cada una ve lo ya acreditado por la anterior. La base lo vuelve a verificar al emitir.
    const [original] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, command.invoiceId)))
      .for('update')
    if (!original) return { status: 'not_found' }
    if (original.status !== 'issued' || original.number === null) {
      return { status: 'not_issued', current: original.status as InvoiceStatus }
    }
    if (original.documentType === 'credit_note') return { status: 'is_credit_note' }

    // 2) Líneas originales + lo ya acreditado → montos de la nota (siempre los de la línea original)
    const [items, credited] = await Promise.all([
      tx
        .select()
        .from(invoiceItems)
        .where(and(eq(invoiceItems.organizationId, organizationId), eq(invoiceItems.invoiceId, original.id))),
      this.creditedByItem(tx, organizationId, original.id),
    ])
    const byId = new Map(items.map((item) => [item.id, item]))

    const picked: { item: (typeof items)[number]; quantity: number; restock: boolean }[] = []
    const seen = new Set<string>()
    for (const [index, line] of command.lines.entries()) {
      const item = byId.get(line.itemId)
      if (!item) return { status: 'line_not_found', index }
      if (seen.has(item.id)) return { status: 'invalid', message: `Línea ${index + 1}: ya está incluida en la nota` }
      seen.add(item.id)
      picked.push({ item, quantity: line.quantity, restock: line.restock })
    }

    const empty = { quantity: 0, gross: 0, discount: 0, net: 0, tax: 0, total: 0 }
    const calc = calculateCreditNote(
      picked.map(({ item, quantity }) => {
        const source: CreditSourceLine = {
          quantity: Number(item.quantity),
          taxRate: Number(item.taxRate),
          original: {
            gross: Number(item.lineGross),
            discount: Number(item.lineDiscount),
            net: Number(item.lineNet),
            tax: Number(item.lineTax),
            total: Number(item.lineTotal),
          },
          credited: credited.get(item.id) ?? empty,
        }
        return { source, quantity }
      }),
      { currencyDecimals: original.currencyDecimals },
    )
    if (!calc.ok) return { status: 'invalid', message: calc.error }

    // 3) Siguiente número NC. Va dentro de la transacción: si algo falla después, el número no se consume.
    const [counter] = await tx
      .insert(invoiceCounters)
      .values({ organizationId, documentType: 'credit_note', lastNumber: 1 })
      .onConflictDoUpdate({
        target: [invoiceCounters.organizationId, invoiceCounters.documentType],
        set: { lastNumber: sql`${invoiceCounters.lastNumber} + 1` },
      })
      .returning({ number: invoiceCounters.lastNumber })
    const number = counter.number

    // 4) Nota en borrador + líneas. Los datos del cliente y del emisor se copian del ORIGINAL (no de hoy).
    //    Una nota no se cobra: queda "pagada" con 0 cobrado, así nunca aparece como cuenta por cobrar.
    const { totals } = calc
    const [created] = await tx
      .insert(invoices)
      .values({
        organizationId,
        documentType: 'credit_note',
        status: 'draft',
        paymentStatus: 'paid',
        paidAt: null,
        paidTotal: '0',
        relatedInvoiceId: original.id,
        creditReason: command.reason,
        customerId: original.customerId,
        customerName: original.customerName,
        customerTaxId: original.customerTaxId,
        customerEmail: original.customerEmail,
        customerAddress: original.customerAddress,
        issuerLegalName: original.issuerLegalName,
        issuerTaxId: original.issuerTaxId,
        issuerAddress: original.issuerAddress,
        currency: original.currency,
        currencyDecimals: original.currencyDecimals,
        taxName: original.taxName,
        pricesIncludeTax: original.pricesIncludeTax,
        dueDate: null,
        subtotal: toMoneyString(totals.subtotal),
        discountTotal: toMoneyString(totals.discountTotal),
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(totals.total),
        idempotencyKey: command.idempotencyKey,
        createdBy: command.userId,
      })
      .returning({ id: invoices.id })

    const restockOf = (restock: boolean, item: (typeof items)[number]) => restock && item.tracksStock && item.productId !== null
    await tx.insert(invoiceItems).values(
      picked.map(({ item, quantity, restock }, index) => ({
        organizationId,
        invoiceId: created.id,
        position: index + 1,
        productId: item.productId,
        sku: item.sku,
        description: item.description,
        unit: item.unit,
        quantity: fromMilli(toMilli(quantity)),
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRate: item.taxRate,
        tracksStock: item.tracksStock,
        relatedItemId: item.id,
        restock: restockOf(restock, item),
        lineGross: toMoneyString(calc.lines[index].gross),
        lineDiscount: toMoneyString(calc.lines[index].discount),
        lineNet: toMoneyString(calc.lines[index].net),
        lineTax: toMoneyString(calc.lines[index].tax),
        lineTotal: toMoneyString(calc.lines[index].total),
      })),
    )

    // 5) Stock: un movimiento por producto con las unidades que vuelven al inventario
    const restocks = planRestock(
      picked.map(({ item, quantity, restock }) => ({
        productId: item.productId,
        quantity,
        tracksStock: item.tracksStock,
        restock,
      })),
    )
    if (restocks.length > 0) {
      const originalType = original.documentType as DocumentType
      const label = `${ANY_DOCUMENT_TYPE_LABELS.credit_note} ${formatDocumentNumber(
        command.documentPrefixes,
        'credit_note',
        number,
      )} (${DOCUMENT_TYPE_LABELS[originalType]} ${formatDocumentNumber(command.documentPrefixes, originalType, original.number)})`
      await tx.insert(stockMovements).values(
        restocks.map((restock) => ({
          organizationId,
          productId: restock.productId,
          type: 'credit_note',
          delta: fromMilli(restock.milli),
          reason: label,
          referenceType: 'invoice',
          referenceId: created.id,
          createdBy: command.userId,
        })),
      )
    }

    // 6) Emitir: la base valida topes y suma lo acreditado al original (credit_total)
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

    // 7) El estado de cobro del original se mide contra lo que queda por cobrar (total − acreditado)
    const [after] = await tx
      .select({
        total: invoices.total,
        creditTotal: invoices.creditTotal,
        paidTotal: invoices.paidTotal,
        paidAt: invoices.paidAt,
      })
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, original.id)))
    const decimals = original.currencyDecimals
    const netMinor = (toMinorUnits(Number(after.total), decimals) ?? 0) - (toMinorUnits(Number(after.creditTotal), decimals) ?? 0)
    const paidMinor = toMinorUnits(Number(after.paidTotal), decimals) ?? 0
    const paymentStatus = paymentStatusFor(paidMinor, netMinor)
    await tx
      .update(invoices)
      .set({
        paymentStatus,
        paidAt: paymentStatus === 'paid' ? (after.paidAt ?? command.issuedAt) : null,
        updatedAt: command.issuedAt,
      })
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, original.id)))

    const creditNote = await this.creditNoteSummary(tx, organizationId, created.id)
    if (!creditNote) throw new Error('No se pudo leer la nota de crédito emitida')
    return { status: 'issued', creditNote }
  }
}
