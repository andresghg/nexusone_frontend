import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { invoiceItems, invoicePayments, invoices, stockMovements } from '@/db/schema'
import { fromMilli, toMilli } from '@/features/inventory/utils/stockMath'
import { DOCUMENT_TYPE_LABELS, type DocumentType, type InvoiceStatus } from '../../types/billing'
import type { VoidCommand, VoidOutcome } from '../../types/invoice'
import { formatDocumentNumber } from '../../utils/documentNumber'

// Anulación de un documento emitido, con devolución de stock, en una sola transacción.
export class InvoiceVoiding {
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
      // Reglas que la base también exige (aquí se detectan antes de tocar el stock, con un mensaje claro)
      if (invoice.documentType === 'credit_note') return { status: 'is_credit_note' }
      const [withNotes] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            eq(invoices.relatedInvoiceId, invoice.id),
            eq(invoices.status, 'issued'),
          ),
        )
        .limit(1)
      if (withNotes) return { status: 'has_credit_notes' }

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
