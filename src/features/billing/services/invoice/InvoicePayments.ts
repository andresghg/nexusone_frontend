import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { invoicePayments, invoices } from '@/db/schema'
import { type InvoiceStatus } from '../../types/billing'
import type { AddPaymentCommand, PaymentOutcome, VoidPaymentCommand, VoidPaymentOutcome } from '../../types/invoice'
import { toMoneyString } from '../../utils/calculateInvoice'
import { fromMinorUnits, toMinorUnits } from '../../utils/minorUnits'
import { paymentStatusFor } from '../../utils/paymentStatus'

// Cobros de un documento: registrar y anular un cobro, con el estado de pago recalculado en la misma transacción.
export class InvoicePayments {
  async addPayment(organizationId: string, command: AddPaymentCommand): Promise<PaymentOutcome> {
    return db.transaction(async (tx): Promise<PaymentOutcome> => {
      // FOR UPDATE: dos cobros simultáneos del mismo documento se ejecutan uno detrás de otro,
      // así el segundo ve el saldo ya descontado y nunca se cobra de más
      const [invoice] = await tx
        .select({
          id: invoices.id,
          status: invoices.status,
          documentType: invoices.documentType,
          total: invoices.total,
          creditTotal: invoices.creditTotal,
          paidTotal: invoices.paidTotal,
          currency: invoices.currency,
          currencyDecimals: invoices.currencyDecimals,
        })
        .from(invoices)
        .where(and(eq(invoices.organizationId, organizationId), eq(invoices.id, command.invoiceId)))
        .for('update')
      if (!invoice) return { status: 'not_found' }
      if (invoice.status !== 'issued') return { status: 'not_issued', current: invoice.status as InvoiceStatus }
      if (invoice.documentType === 'credit_note') return { status: 'credit_note' }

      const decimals = invoice.currencyDecimals
      const amountMinor = toMinorUnits(command.amount, decimals)
      if (amountMinor === null || amountMinor <= 0) return { status: 'invalid_amount', currencyDecimals: decimals }

      // Lo que hay que cobrar es el total menos lo acreditado por notas de crédito
      const totalMinor =
        (toMinorUnits(Number(invoice.total), decimals) ?? 0) - (toMinorUnits(Number(invoice.creditTotal), decimals) ?? 0)
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
        .select({
          id: invoices.id,
          status: invoices.status,
          total: invoices.total,
          creditTotal: invoices.creditTotal,
          currencyDecimals: invoices.currencyDecimals,
        })
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
      const totalMinor =
        (toMinorUnits(Number(invoice.total), decimals) ?? 0) - (toMinorUnits(Number(invoice.creditTotal), decimals) ?? 0)
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
}
