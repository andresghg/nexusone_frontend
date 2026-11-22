import { formatQuantity, toMilli } from '@/features/inventory/utils/stockMath'
import { ANY_DOCUMENT_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../types/billing'
import type { InvoiceDetail, InvoiceListDisplay } from '../types/invoice'
import { formatCalendarDate, formatIssuedDate } from './formatDate'
import { formatDocumentNumber } from './documentNumber'
import { formatMoney } from './formatMoney'
import { taxBreakdownOf } from './taxBreakdown'

/** Escapa lo que va dentro del HTML. Todo texto de la base de datos (nombres, notas, referencias…) pasa por aquí. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STYLES = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 22px 0 6px; }
  .muted { color: #555; }
  .doc { text-align: right; }
  .number { font-size: 18px; font-weight: 600; margin: 0; }
  .void { margin: 16px 0 0; padding: 8px 12px; border: 2px solid #b91c1c; color: #b91c1c; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; color: #555; border-bottom: 1px solid #999; padding: 6px 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { width: 280px; margin: 14px 0 0 auto; }
  .totals td { border: 0; padding: 3px 4px; }
  .totals .grand td { border-top: 1px solid #111; font-size: 15px; font-weight: 700; padding-top: 8px; }
  .strike { text-decoration: line-through; color: #777; }
`

const row = (cells: string) => `<tr>${cells}</tr>`

/**
 * El documento listo para imprimir o guardar como PDF: una página HTML completa y autocontenida
 * (sin recursos externos ni el menú de la aplicación). Función pura, para poder probarla.
 */
export function buildInvoiceHtml(detail: InvoiceDetail, display: InvoiceListDisplay): string {
  const money = (value: number) =>
    escapeHtml(formatMoney(value, { currency: detail.currency, locale: display.locale, decimals: detail.currencyDecimals }))
  const e = escapeHtml

  const typeLabel = ANY_DOCUMENT_TYPE_LABELS[detail.documentType]
  const label = formatDocumentNumber(display.documentPrefixes, detail.documentType, detail.number)
  const isVoid = detail.status === 'void'
  const isCreditNote = detail.documentType === 'credit_note'
  const related = detail.relatedInvoice
  const relatedLabel = related
    ? `${ANY_DOCUMENT_TYPE_LABELS[related.documentType]} ${formatDocumentNumber(display.documentPrefixes, related.documentType, related.number)}`
    : ''
  const activePayments = detail.payments.filter((payment) => payment.voidedAt === null)

  const lines = detail.items
    .map((item) => {
      const discount =
        item.discountValue === 0
          ? ''
          : item.discountType === 'percent'
            ? `${item.discountValue}%`
            : money(item.discountValue)
      return row(
        `<td>${e(item.description)}${item.sku ? `<div class="muted">${e(item.sku)}</div>` : ''}</td>` +
          `<td class="num">${e(formatQuantity(toMilli(item.quantity)))} ${e(item.unit)}</td>` +
          `<td class="num">${money(item.unitPrice)}</td>` +
          `<td class="num">${e(discount)}</td>` +
          `<td class="num">${item.taxRate}%</td>` +
          `<td class="num">${money(item.lineTotal)}</td>`,
      )
    })
    .join('')

  const taxRows = taxBreakdownOf(detail.items, detail.currencyDecimals)
    .filter((entry) => entry.rate > 0)
    .map((entry) => row(`<td>${e(detail.taxName)} ${entry.rate}%</td><td class="num">${money(entry.tax)}</td>`))
    .join('')

  const payments = activePayments
    .map((payment) =>
      row(
        `<td>${e(formatIssuedDate(payment.paidAt, display))}</td>` +
          `<td>${e(PAYMENT_METHOD_LABELS[payment.method])}${payment.reference ? ` · ${e(payment.reference)}` : ''}</td>` +
          `<td class="num">${money(payment.amount)}</td>`,
      ),
    )
    .join('')

  const customer = detail.customer
    ? [
        `<strong>${e(detail.customer.name)}</strong>`,
        detail.customer.taxId ? e(detail.customer.taxId) : '',
        detail.customer.address ? e(detail.customer.address) : '',
        detail.customer.email ? e(detail.customer.email) : '',
      ]
        .filter(Boolean)
        .join('<br>')
    : '<span class="muted">Sin cliente</span>'

  const issuer = [
    detail.issuer.legalName ? `<strong>${e(detail.issuer.legalName)}</strong>` : '',
    detail.issuer.taxId ? e(detail.issuer.taxId) : '',
    detail.issuer.address ? e(detail.issuer.address) : '',
  ]
    .filter(Boolean)
    .join('<br>')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${e(typeLabel)} ${e(label)}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <div>${issuer}</div>
  <div class="doc">
    <h1>${e(typeLabel)}</h1>
    <p class="number">${e(label)}</p>
    <div class="muted">Emitida el ${e(formatIssuedDate(detail.issuedAt, display))}</div>
    ${detail.dueDate && !isCreditNote ? `<div class="muted">Vence el ${e(formatCalendarDate(detail.dueDate, display.locale))}</div>` : ''}
  </div>
</header>
${isVoid ? `<div class="void">DOCUMENTO ANULADO${detail.voidReason ? ` · ${e(detail.voidReason)}` : ''}</div>` : ''}
${isCreditNote ? `<h2>Documento que corrige</h2><div>${e(relatedLabel)}${detail.creditReason ? `<br><span class="muted">Motivo: ${e(detail.creditReason)}</span>` : ''}</div>` : ''}
<h2>Cliente</h2>
<div>${customer}</div>
<h2>Detalle</h2>
<table>
  <thead><tr><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Dto.</th><th class="num">${e(detail.taxName)}</th><th class="num">Total</th></tr></thead>
  <tbody>${lines}</tbody>
</table>
<table class="totals">
  <tr><td>Neto</td><td class="num">${money(detail.subtotal)}</td></tr>
  ${detail.discountTotal > 0 ? `<tr><td>Descuentos</td><td class="num">-${money(detail.discountTotal)}</td></tr>` : ''}
  ${taxRows}
  <tr class="grand"><td>Total</td><td class="num">${money(detail.total)}</td></tr>
  ${!isVoid && !isCreditNote && activePayments.length > 0 ? `<tr><td>Pagado</td><td class="num">${money(detail.paidTotal)}</td></tr><tr><td>Saldo</td><td class="num">${money(detail.balance)}</td></tr>` : ''}
</table>
${!isVoid && !isCreditNote && activePayments.length > 0 ? `<h2>Cobros</h2><table><tbody>${payments}</tbody></table>` : ''}
${detail.notes ? `<h2>Notas</h2><div>${e(detail.notes).replace(/\n/g, '<br>')}</div>` : ''}
</body>
</html>`
}
