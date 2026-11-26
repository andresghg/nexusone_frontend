import { escapeHtml as e } from '@/features/billing/utils/invoiceHtml'
import { formatMoney } from '@/features/billing/utils/formatMoney'
import { formatStock } from '@/features/inventory/utils/format'
import {
  AGING_LABELS,
  type DateRange,
  type Granularity,
  type ReceivablesReport,
  type ReportExport,
  type ReportExportMeta,
  type SalesPoint,
  type SalesReport,
  type TopProductsReport,
} from '../types/report'
import { bucketLabel, bucketTick, calendarDate, percentOf } from './reportFormat'

// El reporte listo para imprimir o guardar como PDF: una página HTML completa y autocontenida (sin recursos
// externos ni el menú de la aplicación), con el mismo contenido de la pantalla. Funciones puras, fáciles de probar.

const STYLES = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 0; }
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555; margin: 20px 0 6px; }
  .muted { color: #555; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0; padding: 0; list-style: none; }
  .kpis li { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; break-inside: avoid; }
  .kpis .label { font-size: 10px; color: #555; }
  .kpis .value { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .kpis .detail { font-size: 10px; color: #555; }
  .kpis .warn .value { color: #b91c1c; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { text-align: left; font-size: 10px; color: #555; border-bottom: 1px solid #999; padding: 5px 4px; }
  td { padding: 5px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
  tfoot td, tfoot th { border-top: 1px solid #111; border-bottom: 0; font-weight: 700; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .neg { color: #b91c1c; }
  svg { display: block; width: 100%; height: auto; }
  footer { margin-top: 18px; font-size: 10px; color: #777; }
`

const TITLES = { ventas: 'Reporte de ventas', productos: 'Productos más vendidos', cobrar: 'Cuentas por cobrar' } as const

type Money = (value: number) => string
type Kpi = { label: string; value: string; detail?: string; warn?: boolean }

const kpiList = (items: Kpi[]) =>
  `<ul class="kpis">${items
    .map(
      (kpi) =>
        `<li${kpi.warn ? ' class="warn"' : ''}><div class="label">${e(kpi.label)}</div><div class="value">${e(kpi.value)}</div>${kpi.detail ? `<div class="detail">${e(kpi.detail)}</div>` : ''}</li>`,
    )
    .join('')}</ul>`

/**
 * Gráfico de barras de ventas netas como SVG propio (sin librerías ni recursos externos): lo positivo en
 * oscuro, lo negativo en rojo, con la línea base. Solo se rotulan el primer y el último período.
 */
export function salesChartSvg(points: SalesPoint[], granularity: Granularity, locale: string, description: string): string {
  const width = 720
  const height = 150
  const top = 8
  const bottom = 18 // espacio para los rótulos del eje
  const plot = height - top - bottom
  const maxAbs = Math.max(...points.map((point) => Math.abs(point.netTotal)), 1)
  const hasNegative = points.some((point) => point.netTotal < 0)
  const maxPositive = Math.max(...points.map((point) => Math.max(point.netTotal, 0)), 0)
  const maxNegative = Math.max(...points.map((point) => Math.max(-point.netTotal, 0)), 0)
  // La línea base se reparte según cuánto hay arriba y abajo
  const span = maxPositive + maxNegative || maxAbs
  const baseline = top + (hasNegative ? (maxPositive / span) * plot : plot)
  const unit = plot / span
  const slot = width / Math.max(points.length, 1)
  const barWidth = Math.max(1, Math.min(slot * 0.7, 40))

  const bars = points
    .map((point, index) => {
      const x = index * slot + (slot - barWidth) / 2
      const size = Math.abs(point.netTotal) * unit
      if (size === 0) return ''
      const y = point.netTotal >= 0 ? baseline - size : baseline
      const fill = point.netTotal >= 0 ? '#1f2937' : '#b91c1c'
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(size, 0.5).toFixed(1)}" fill="${fill}"/>`
    })
    .join('')

  const label = (point: SalesPoint, anchor: 'start' | 'end', x: number) =>
    `<text x="${x}" y="${height - 4}" font-size="10" fill="#555" text-anchor="${anchor}">${e(bucketTick(point.bucket, granularity, locale))}</text>`
  const first = points[0]
  const last = points[points.length - 1]
  const axis = points.length > 1 ? label(first, 'start', 0) + label(last, 'end', width) : label(first, 'start', 0)

  return (
    `<svg role="img" aria-label="${e(description)}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<line x1="0" y1="${baseline.toFixed(1)}" x2="${width}" y2="${baseline.toFixed(1)}" stroke="#999" stroke-width="0.5"/>${bars}${axis}</svg>`
  )
}

function salesBody(report: SalesReport, money: Money): string {
  const { totals, points, granularity, display } = report
  const unit = granularity === 'day' ? 'día' : 'mes'
  const active = points.filter((point) => point.documents > 0 || point.creditNotes > 0)
  if (active.length === 0) return '<p class="muted">Sin ventas en este período.</p>'

  const rows = active
    .map(
      (point) =>
        `<tr><td>${e(bucketLabel(point.bucket, granularity, display.locale))}</td><td class="num">${point.documents}</td>` +
        `<td class="num">${e(money(point.invoicedTotal))}</td>` +
        `<td class="num">${point.creditNotes > 0 ? e(`−${money(point.creditedTotal)}`) : '—'}</td>` +
        `<td class="num${point.netTotal < 0 ? ' neg' : ''}">${e(money(point.netTotal))}</td></tr>`,
    )
    .join('')

  return (
    kpiList([
      { label: 'Ventas netas', value: money(totals.netTotal), detail: `Neto sin impuesto ${money(totals.netSubtotal)} · Impuesto ${money(totals.netTax)}` },
      { label: 'Documentos emitidos', value: String(totals.documents), detail: `Ticket promedio ${money(totals.averageTicket)}` },
      {
        label: 'Notas de crédito',
        value: totals.creditNotes === 0 ? '0' : `−${money(totals.creditedTotal)}`,
        detail: totals.creditNotes === 0 ? 'Sin devoluciones' : `${totals.creditNotes} emitida${totals.creditNotes === 1 ? '' : 's'}`,
      },
      { label: 'Cobrado', value: money(totals.collected), detail: 'Cobros registrados en el período' },
    ]) +
    `<h2>Ventas netas por ${unit}</h2>` +
    salesChartSvg(points, granularity, display.locale, `Gráfico de ventas netas por ${unit}. Total del período: ${money(totals.netTotal)}.`) +
    `<h2>Detalle por ${unit}</h2><table><thead><tr><th>${granularity === 'day' ? 'Día' : 'Mes'}</th><th class="num">Documentos</th><th class="num">Facturado</th><th class="num">Notas de crédito</th><th class="num">Ventas netas</th></tr></thead>` +
    `<tbody>${rows}</tbody><tfoot><tr><th>Total</th><td class="num">${totals.documents}</td><td class="num">${e(money(totals.invoicedTotal))}</td>` +
    `<td class="num">${totals.creditNotes > 0 ? e(`−${money(totals.creditedTotal)}`) : '—'}</td><td class="num">${e(money(totals.netTotal))}</td></tr></tfoot></table>`
  )
}

function productsBody(report: TopProductsReport, money: Money): string {
  if (report.products.length === 0) return '<p class="muted">Sin productos vendidos en este período.</p>'
  const rows = report.products
    .map(
      (product, index) =>
        `<tr><td class="num">${index + 1}</td><td>${e(product.description)}<div class="muted">${e(product.sku ?? 'Concepto libre')}</div></td>` +
        `<td class="num">${e(formatStock(product.quantity, report.display))} ${e(product.unit)}</td><td class="num">${e(money(product.total))}</td></tr>`,
    )
    .join('')
  return (
    `<p class="muted">Descuentan lo acreditado con notas de crédito. Importes con impuesto.</p>` +
    `<table><thead><tr><th class="num">N°</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Importe</th></tr></thead><tbody>${rows}</tbody></table>`
  )
}

function receivablesBody(report: ReceivablesReport, money: Money): string {
  const { display, asOf } = report
  if (report.documents === 0) return `<p class="muted">No hay nada por cobrar al ${e(calendarDate(asOf, display.locale))}.</p>`

  const aging = report.aging
    .map(
      (row) =>
        `<tr><td>${e(AGING_LABELS[row.bucket])}</td><td class="num">${row.documents}</td><td class="num">${e(money(row.amount))}</td><td class="num">${percentOf(row.amount, report.total)} %</td></tr>`,
    )
    .join('')
  const debtors = report.debtors
    .map((debtor) => {
      const late = debtor.oldestDueDate !== null && debtor.oldestDueDate < asOf
      const due = debtor.oldestDueDate ? `${late ? 'Vencido desde' : 'Vence'} el ${calendarDate(debtor.oldestDueDate, display.locale)}` : 'Sin fecha de vencimiento'
      return `<tr><td>${e(debtor.name)}</td><td class="num">${debtor.documents}</td><td${late ? ' class="neg"' : ''}>${e(due)}</td><td class="num">${e(money(debtor.amount))}</td></tr>`
    })
    .join('')

  return (
    kpiList([
      { label: 'Por cobrar', value: money(report.total), detail: `${report.documents} documento${report.documents === 1 ? '' : 's'} con saldo` },
      {
        label: 'Vencido',
        value: money(report.overdue),
        warn: report.overdue > 0,
        detail: report.overdueDocuments === 0 ? 'Nada vencido' : `${report.overdueDocuments} documento${report.overdueDocuments === 1 ? '' : 's'}`,
      },
    ]) +
    `<h2>Antigüedad de la deuda</h2><table><thead><tr><th>Tramo</th><th class="num">Documentos</th><th class="num">Monto</th><th class="num">% de la deuda</th></tr></thead><tbody>${aging}</tbody></table>` +
    `<h2>Quién debe más</h2><table><thead><tr><th>Cliente</th><th class="num">Documentos</th><th>Vencimiento más antiguo</th><th class="num">Monto</th></tr></thead><tbody>${debtors}</tbody></table>`
  )
}

function periodText(range: DateRange, locale: string): string {
  return range.from === range.to
    ? `El ${calendarDate(range.from, locale)}`
    : `Del ${calendarDate(range.from, locale)} al ${calendarDate(range.to, locale)}`
}

export function buildReportHtml(data: ReportExport, meta: ReportExportMeta): string {
  const { display } = data.report
  const money: Money = (value) =>
    formatMoney(value, { currency: display.currency, locale: display.locale, decimals: display.currencyDecimals })

  let title: string = TITLES[data.tab]
  if (data.tab === 'productos') title = `Productos más vendidos (por ${data.report.rank === 'quantity' ? 'cantidad' : 'importe'})`

  const subtitle =
    data.tab === 'cobrar' ? `Al ${calendarDate(data.report.asOf, display.locale)}` : periodText(data.report.range, display.locale)
  const body = data.tab === 'ventas' ? salesBody(data.report, money) : data.tab === 'productos' ? productsBody(data.report, money) : receivablesBody(data.report, money)

  let generated: string
  try {
    generated = new Intl.DateTimeFormat(display.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: display.timezone }).format(meta.generatedAt)
  } catch {
    generated = meta.generatedAt.toISOString()
  }

  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${e(`${title} — ${meta.companyName}`)}</title><style>${STYLES}</style></head><body>` +
    `<header><h1>${e(title)}</h1><div>${e(meta.companyName)}</div><div class="muted">${e(subtitle)} · Montos en ${e(display.currency)}</div></header>` +
    body +
    `<footer>Generado el ${e(generated)}</footer></body></html>`
  )
}
