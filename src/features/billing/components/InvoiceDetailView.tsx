'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban, Banknote, FileMinus2, Printer } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { formatQuantity, toMilli } from '@/features/inventory/utils/stockMath'
import { ANY_DOCUMENT_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../types/billing'
import type { InvoiceDetail, InvoiceListDisplay, InvoicePayment } from '../types/invoice'
import { formatCalendarDate, formatIssuedDate } from '../utils/formatDate'
import { formatDocumentNumber } from '../utils/documentNumber'
import { formatMoney } from '../utils/formatMoney'
import { buildInvoiceHtml } from '../utils/invoiceHtml'
import { invoiceBadge } from '../utils/invoiceStatus'
import { printHtml } from '../utils/printHtml'
import { taxBreakdownOf } from '../utils/taxBreakdown'
import { RegisterPaymentDialog } from './RegisterPaymentDialog'
import { VoidInvoiceDialog } from './VoidInvoiceDialog'
import { VoidPaymentDialog } from './VoidPaymentDialog'

type Props = {
  organizationId: string
  detail: InvoiceDetail
  display: InvoiceListDisplay
  listHref: string
  canCollect: boolean // registrar cobros
  canVoid: boolean // anular el documento y sus cobros
  print?: (html: string) => void // se puede reemplazar en pruebas
}

type Dialog = { kind: 'payment' } | { kind: 'void' } | { kind: 'void-payment'; payment: InvoicePayment } | null

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-0.5 text-sm">{children}</div>
    </section>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</dd>
    </div>
  )
}

export function InvoiceDetailView({
  organizationId,
  detail,
  display,
  listHref,
  canCollect,
  canVoid,
  print = printHtml,
}: Props) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [dialogKey, setDialogKey] = useState(0)
  const open = (next: Dialog) => {
    setDialogKey((key) => key + 1) // formulario nuevo en cada apertura: no arrastra valores anteriores
    setDialog(next)
  }

  const format = { currency: detail.currency, locale: display.locale, decimals: detail.currencyDecimals }
  const money = (value: number) => formatMoney(value, format)
  const label = formatDocumentNumber(display.documentPrefixes, detail.documentType, detail.number)
  const typeLabel = ANY_DOCUMENT_TYPE_LABELS[detail.documentType]
  const badge = invoiceBadge(detail)
  const isIssued = detail.status === 'issued'
  const isVoid = detail.status === 'void'
  const isCreditNote = detail.documentType === 'credit_note'
  const hasCreditNotes = detail.creditNotes.length > 0
  // Se puede acreditar un documento emitido (no una nota) mientras quede algo por acreditar
  const canCredit = canVoid && isIssued && !isCreditNote && detail.creditTotal < detail.total
  const creditHref = `${listHref}/${detail.id}/nota-de-credito`
  const related = detail.relatedInvoice
  const relatedLabel = related
    ? `${ANY_DOCUMENT_TYPE_LABELS[related.documentType]} ${formatDocumentNumber(display.documentPrefixes, related.documentType, related.number)}`
    : null
  const inFavor = detail.balance < 0 // el cliente pagó más de lo que quedó tras las notas
  const taxRows = taxBreakdownOf(detail.items, detail.currencyDecimals).filter((row) => row.rate > 0)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Facturación
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {typeLabel} {label}
              </h1>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Emitida el {formatIssuedDate(detail.issuedAt, display)}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => print(buildInvoiceHtml(detail, display))}>
              <Printer aria-hidden />
              Imprimir
            </Button>
            {canCollect && isIssued && !isCreditNote && detail.balance > 0 && (
              <Button type="button" onClick={() => open({ kind: 'payment' })}>
                <Banknote aria-hidden />
                Registrar cobro
              </Button>
            )}
            {canCredit && (
              <Button asChild variant="outline">
                <Link href={creditHref}>
                  <FileMinus2 aria-hidden />
                  Crear nota de crédito
                </Link>
              </Button>
            )}
            {canVoid && isIssued && !isCreditNote && !hasCreditNotes && (
              <Button type="button" variant="outline" onClick={() => open({ kind: 'void' })}>
                <Ban aria-hidden />
                Anular documento
              </Button>
            )}
          </div>
        </div>
        {canVoid && isIssued && hasCreditNotes && (
          <p className="text-xs text-muted-foreground">
            Este documento tiene notas de crédito emitidas, por eso ya no se puede anular.
          </p>
        )}
      </header>

      {isCreditNote && related && (
        <div role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">
          Esta nota corrige{' '}
          <Link href={`${listHref}/${related.id}`} className="font-medium underline-offset-2 hover:underline">
            {relatedLabel}
          </Link>
          .{detail.creditReason && <> Motivo: {detail.creditReason}</>}
        </div>
      )}

      {isVoid && (
        <div
          role="status"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          Documento anulado{detail.voidedAt && ` el ${formatIssuedDate(detail.voidedAt, display)}`}.
          {detail.voidReason && <> Motivo: {detail.voidReason}</>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Emisor">
          {detail.issuer.legalName ? (
            <p className="font-medium">{detail.issuer.legalName}</p>
          ) : (
            <p className="text-muted-foreground">—</p>
          )}
          {detail.issuer.taxId && <p>{detail.issuer.taxId}</p>}
          {detail.issuer.address && <p className="text-muted-foreground">{detail.issuer.address}</p>}
        </Card>

        <Card title="Cliente">
          {detail.customer ? (
            <>
              <p className="font-medium">{detail.customer.name}</p>
              {detail.customer.taxId && <p>{detail.customer.taxId}</p>}
              {detail.customer.address && <p className="text-muted-foreground">{detail.customer.address}</p>}
              {detail.customer.email && <p className="text-muted-foreground">{detail.customer.email}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">Sin cliente</p>
          )}
        </Card>

        {isCreditNote ? (
          <Card title="Documento corregido">
            {related ? (
              <>
                <Link href={`${listHref}/${related.id}`} className="font-medium hover:underline">
                  {relatedLabel}
                </Link>
                {detail.creditReason && <p className="text-muted-foreground">{detail.creditReason}</p>}
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </Card>
        ) : (
          <Card title="Cobro">
            <dl className="space-y-0.5">
              <Row label="Total" value={money(detail.total)} />
              {!isVoid && detail.creditTotal > 0 && <Row label="Acreditado" value={`−${money(detail.creditTotal)}`} />}
              {!isVoid && <Row label="Cobrado" value={money(detail.paidTotal)} />}
              {!isVoid && (
                <Row
                  label={inFavor ? 'Saldo a favor del cliente' : 'Saldo'}
                  value={money(inFavor ? -detail.balance : detail.balance)}
                  strong
                />
              )}
              {detail.dueDate && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Vencimiento</dt>
                  <dd className={detail.overdue ? 'text-destructive' : undefined}>
                    {formatCalendarDate(detail.dueDate, display.locale)}
                    {detail.overdue && ' · Vencida'}
                  </dd>
                </div>
              )}
            </dl>
            {!isVoid && inFavor && (
              <p className="pt-1 text-xs text-muted-foreground">
                La devolución del dinero al cliente se registra fuera del sistema.
              </p>
            )}
          </Card>
        )}
      </div>

      <section aria-labelledby="lines-heading" className="space-y-2">
        <h2 id="lines-heading" className="text-sm font-semibold">
          Detalle
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Descripción</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Precio</th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Dto.</th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell">{detail.taxName}</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {detail.items.map((item) => (
                <tr key={item.position}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{item.description}</p>
                    {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatQuantity(toMilli(item.quantity))} {item.unit}
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{money(item.unitPrice)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">
                    {item.discountValue === 0
                      ? '—'
                      : item.discountType === 'percent'
                        ? `${item.discountValue}%`
                        : money(item.discountValue)}
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{item.taxRate}%</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto w-full max-w-xs space-y-1 pt-2 text-sm">
          <Row label="Neto" value={money(detail.subtotal)} />
          {detail.discountTotal > 0 && <Row label="Descuentos" value={`-${money(detail.discountTotal)}`} />}
          {taxRows.map((row) => (
            <Row key={row.rate} label={`${detail.taxName} ${row.rate}%`} value={money(row.tax)} />
          ))}
          <div className="flex items-baseline justify-between gap-4 border-t pt-2">
            <dt className="font-medium">Total</dt>
            <dd className="text-lg font-semibold tabular-nums">{money(detail.total)}</dd>
          </div>
        </dl>
      </section>

      {hasCreditNotes && (
        <section aria-labelledby="credit-notes-heading" className="space-y-2">
          <h2 id="credit-notes-heading" className="text-sm font-semibold">
            Notas de crédito
          </h2>
          <ul aria-label="Notas de crédito del documento" className="divide-y rounded-lg border">
            {detail.creditNotes.map((note) => (
              <li key={note.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Link href={`${listHref}/${note.id}`} className="font-medium tabular-nums hover:underline">
                    {formatDocumentNumber(display.documentPrefixes, 'credit_note', note.number)}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatIssuedDate(note.issuedAt, display)}</p>
                </div>
                <span className="tabular-nums">−{money(note.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isCreditNote && (
        <section aria-labelledby="payments-heading" className="space-y-2">
          <h2 id="payments-heading" className="text-sm font-semibold">
            Cobros
          </h2>
          {detail.payments.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aún no hay cobros registrados.
            </p>
          ) : (
            <ul aria-label="Cobros del documento" className="divide-y rounded-lg border">
              {detail.payments.map((payment) => {
                const voided = payment.voidedAt !== null
                return (
                  <li key={payment.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className={voided ? 'text-muted-foreground line-through' : 'font-medium'}>
                        {PAYMENT_METHOD_LABELS[payment.method]}
                        {payment.reference && ` · ${payment.reference}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatIssuedDate(payment.paidAt, display)}
                        {voided && payment.voidReason && ` · Anulado: ${payment.voidReason}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={voided ? 'tabular-nums text-muted-foreground line-through' : 'tabular-nums'}>
                        {money(payment.amount)}
                      </span>
                      {canVoid && isIssued && !voided && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Anular cobro de ${money(payment.amount)}`}
                          onClick={() => open({ kind: 'void-payment', payment })}
                        >
                          Anular
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {detail.notes && (
        <section aria-labelledby="notes-heading" className="space-y-1">
          <h2 id="notes-heading" className="text-sm font-semibold">
            Notas
          </h2>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{detail.notes}</p>
        </section>
      )}

      {dialog?.kind === 'payment' && (
        <RegisterPaymentDialog
          key={dialogKey}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          organizationId={organizationId}
          invoiceId={detail.id}
          documentLabel={label}
          balance={detail.balance}
          format={format}
        />
      )}
      {dialog?.kind === 'void' && (
        <VoidInvoiceDialog
          key={dialogKey}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          organizationId={organizationId}
          invoiceId={detail.id}
          documentLabel={label}
        />
      )}
      {dialog?.kind === 'void-payment' && (
        <VoidPaymentDialog
          key={dialogKey}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          organizationId={organizationId}
          paymentId={dialog.payment.id}
          summary={`${PAYMENT_METHOD_LABELS[dialog.payment.method]} · ${money(dialog.payment.amount)}`}
        />
      )}
    </div>
  )
}
