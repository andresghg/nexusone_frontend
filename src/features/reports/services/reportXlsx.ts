import ExcelJS from 'exceljs'
import {
  AGING_LABELS,
  type ReceivablesReport,
  type ReportExport,
  type ReportExportMeta,
  type SalesReport,
  type TopProductsReport,
} from '../types/report'

// Excel de los reportes (.xlsx de verdad: los montos son números, las fechas son fechas y los totales son
// fórmulas, para que la persona pueda ordenar, filtrar y seguir calculando). Solo servidor.

const BOLD = { bold: true } as const
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } } as const

/** Formato numérico con los decimales de la moneda; los negativos en rojo, para que una devolución no pase inadvertida. */
export const moneyFormat = (decimals: number) => {
  const body = decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0'
  return `${body};[Red]-${body}`
}

const calendar = (value: string) => new Date(`${value}T00:00:00Z`) // Excel guarda fechas sin zona: se escribe en UTC

function stamp(meta: ReportExportMeta, display: { locale: string; timezone: string }) {
  try {
    return new Intl.DateTimeFormat(display.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: display.timezone }).format(meta.generatedAt)
  } catch {
    return meta.generatedAt.toISOString()
  }
}

function heading(sheet: ExcelJS.Worksheet, title: string, lines: string[]) {
  sheet.addRow([title]).font = { bold: true, size: 14 }
  for (const line of lines) sheet.addRow([line]).font = { color: { argb: 'FF555555' } }
  sheet.addRow([])
}

function tableHeader(sheet: ExcelJS.Worksheet, labels: string[], align: ('left' | 'right')[]) {
  const row = sheet.addRow(labels)
  row.font = BOLD
  row.eachCell((cell, index) => {
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: align[index - 1] ?? 'left', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  return row.number
}

function setup(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width))
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
}

function summaryRows(sheet: ExcelJS.Worksheet, items: [string, number | string, string?][], numFmt: string) {
  for (const [label, value, format] of items) {
    const row = sheet.addRow([label, value])
    row.getCell(1).font = BOLD
    if (typeof value === 'number') {
      row.getCell(2).numFmt = format ?? numFmt
      row.getCell(2).alignment = { horizontal: 'right' }
    }
  }
  sheet.addRow([])
}

function sales(workbook: ExcelJS.Workbook, report: SalesReport, meta: ReportExportMeta) {
  const { display, totals, points, granularity, range } = report
  const money = moneyFormat(display.currencyDecimals)
  const sheet = workbook.addWorksheet('Ventas')
  heading(
    sheet,
    'Reporte de ventas',
    [
      meta.companyName,
      `Período: ${range.from} al ${range.to} (por ${granularity === 'day' ? 'día' : 'mes'})`,
      `Moneda: ${display.currency} · Montos con impuesto, salvo donde se indique`,
      `Generado: ${stamp(meta, display)}`,
    ],
  )
  summaryRows(
    sheet,
    [
      ['Ventas netas (con impuesto)', totals.netTotal],
      ['Neto sin impuesto', totals.netSubtotal],
      ['Impuesto neto', totals.netTax],
      ['Documentos emitidos', totals.documents, '#,##0'],
      ['Ticket promedio', totals.averageTicket],
      ['Notas de crédito emitidas', totals.creditNotes, '#,##0'],
      ['Monto acreditado', totals.creditedTotal],
      ['Cobrado en el período', totals.collected],
    ],
    money,
  )

  const headerRow = tableHeader(
    sheet,
    [granularity === 'day' ? 'Día' : 'Mes', 'Documentos', 'Facturado (con impuesto)', 'Facturado (neto)', 'Notas de crédito', 'Acreditado (con impuesto)', 'Acreditado (neto)', 'Ventas netas (con impuesto)', 'Ventas netas (neto)'],
    ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
  )
  // Solo los períodos con movimiento (los vacíos están en el gráfico de la pantalla, no en la planilla)
  const active = points.filter((point) => point.documents > 0 || point.creditNotes > 0)
  for (const point of active) {
    const row = sheet.addRow([
      granularity === 'day' ? calendar(point.bucket) : calendar(`${point.bucket}-01`),
      point.documents,
      point.invoicedTotal,
      point.invoicedSubtotal,
      point.creditNotes,
      point.creditedTotal,
      point.creditedSubtotal,
      point.netTotal,
      point.netSubtotal,
    ])
    row.getCell(1).numFmt = granularity === 'day' ? 'dd-mm-yyyy' : 'mmmm yyyy'
    row.getCell(1).alignment = { horizontal: 'left' }
    for (const col of [3, 4, 6, 7, 8, 9]) row.getCell(col).numFmt = money
    for (const col of [2, 5]) row.getCell(col).numFmt = '#,##0'
  }

  const first = headerRow + 1
  const last = headerRow + active.length
  const total = sheet.addRow(['Total'])
  total.font = BOLD
  const sums: [number, number][] = [
    [2, totals.documents], [3, totals.invoicedTotal], [4, totals.invoicedSubtotal], [5, totals.creditNotes],
    [6, totals.creditedTotal], [7, totals.creditedSubtotal], [8, totals.netTotal], [9, totals.netSubtotal],
  ]
  for (const [col, result] of sums) {
    const letter = sheet.getColumn(col).letter
    // Fórmula con el resultado ya calculado: se ve bien incluso en visores que no recalculan
    total.getCell(col).value = active.length > 0 ? { formula: `SUM(${letter}${first}:${letter}${last})`, result } : result
    total.getCell(col).numFmt = col === 2 || col === 5 ? '#,##0' : money
  }
  total.eachCell((cell) => (cell.border = { top: { style: 'thin' } }))

  setup(sheet, [30, 13, 20, 18, 16, 22, 18, 24, 20])
  if (active.length > 0) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: last, column: 9 } }
}

function products(workbook: ExcelJS.Workbook, report: TopProductsReport, meta: ReportExportMeta) {
  const { display, range, rank } = report
  const money = moneyFormat(display.currencyDecimals)
  const sheet = workbook.addWorksheet('Productos')
  heading(
    sheet,
    `Productos más vendidos (por ${rank === 'quantity' ? 'cantidad' : 'importe'})`,
    [
      meta.companyName,
      `Período: ${range.from} al ${range.to}`,
      `Moneda: ${display.currency} · Descuentan lo acreditado con notas de crédito`,
      `Generado: ${stamp(meta, display)}`,
    ],
  )
  const headerRow = tableHeader(sheet, ['N°', 'Producto', 'SKU', 'Unidad', 'Cantidad', 'Importe (con impuesto)', 'Importe (neto)'], ['left', 'left', 'left', 'left', 'right', 'right', 'right'])
  report.products.forEach((product, index) => {
    const row = sheet.addRow([index + 1, product.description, product.sku ?? 'Concepto libre', product.unit, product.quantity, product.total, product.net])
    row.getCell(5).numFmt = '#,##0.###'
    row.getCell(6).numFmt = money
    row.getCell(7).numFmt = money
  })
  setup(sheet, [6, 38, 18, 10, 14, 22, 18])
  if (report.products.length > 0) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + report.products.length, column: 7 } }
}

function receivables(workbook: ExcelJS.Workbook, report: ReceivablesReport, meta: ReportExportMeta) {
  const { display, asOf } = report
  const money = moneyFormat(display.currencyDecimals)
  const sheet = workbook.addWorksheet('Por cobrar')
  heading(
    sheet,
    'Cuentas por cobrar',
    [meta.companyName, `Al ${asOf}`, `Moneda: ${display.currency} · Saldo = total − notas de crédito − cobros`, `Generado: ${stamp(meta, display)}`],
  )
  summaryRows(
    sheet,
    [
      ['Por cobrar', report.total],
      ['Documentos con saldo', report.documents, '#,##0'],
      ['Vencido', report.overdue],
      ['Documentos vencidos', report.overdueDocuments, '#,##0'],
    ],
    money,
  )

  sheet.addRow(['Antigüedad de la deuda']).font = { bold: true, size: 12 }
  tableHeader(sheet, ['Tramo', 'Documentos', 'Monto'], ['left', 'right', 'right'])
  for (const row of report.aging) {
    const line = sheet.addRow([AGING_LABELS[row.bucket], row.documents, row.amount])
    line.getCell(2).numFmt = '#,##0'
    line.getCell(3).numFmt = money
  }
  sheet.addRow([])

  sheet.addRow(['Clientes que más deben']).font = { bold: true, size: 12 }
  tableHeader(sheet, ['Cliente', 'Documentos', 'Monto', 'Vencimiento más antiguo'], ['left', 'right', 'right', 'left'])
  for (const debtor of report.debtors) {
    const line = sheet.addRow([debtor.name, debtor.documents, debtor.amount, debtor.oldestDueDate ? calendar(debtor.oldestDueDate) : 'Sin fecha'])
    line.getCell(2).numFmt = '#,##0'
    line.getCell(3).numFmt = money
    line.getCell(4).numFmt = 'dd-mm-yyyy'
    line.getCell(4).alignment = { horizontal: 'left' }
  }
  setup(sheet, [36, 14, 18, 26])
}

/** El .xlsx del reporte activo, listo para descargar. */
export async function buildReportWorkbook(data: ReportExport, meta: ReportExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = meta.companyName
  workbook.created = meta.generatedAt
  workbook.title = data.tab === 'ventas' ? 'Reporte de ventas' : data.tab === 'productos' ? 'Productos más vendidos' : 'Cuentas por cobrar'

  if (data.tab === 'ventas') sales(workbook, data.report, meta)
  else if (data.tab === 'productos') products(workbook, data.report, meta)
  else receivables(workbook, data.report, meta)

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
