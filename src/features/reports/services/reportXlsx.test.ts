import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_FORMAT } from '@/features/billing/types/billing'
import type { PaymentsReport, ReceivablesReport, ReportExport, SalesPoint, SalesReport, TopProductsReport } from '../types/report'
import { buildReportWorkbook, moneyFormat } from './reportXlsx'

const meta = { companyName: 'Acme SpA', generatedAt: new Date('2026-11-24T15:00:00Z') }
const display = DEFAULT_DISPLAY_FORMAT

const point = (over: Partial<SalesPoint> & { bucket: string }): SalesPoint => ({
  documents: 0, invoicedTotal: 0, invoicedSubtotal: 0, creditNotes: 0, creditedTotal: 0, creditedSubtotal: 0, netTotal: 0, netSubtotal: 0, ...over,
})
const sales = (over: Partial<SalesReport> = {}): SalesReport => ({
  range: { from: '2026-11-20', to: '2026-11-23' },
  granularity: 'day',
  display,
  points: [
    point({ bucket: '2026-11-20', documents: 2, invoicedTotal: 3570, invoicedSubtotal: 3000, netTotal: 3570, netSubtotal: 3000 }),
    point({ bucket: '2026-11-21' }),
    point({ bucket: '2026-11-22', creditNotes: 1, creditedTotal: 1190, creditedSubtotal: 1000, netTotal: -1190, netSubtotal: -1000 }),
    point({ bucket: '2026-11-23', documents: 1, invoicedTotal: 1190, invoicedSubtotal: 1000, netTotal: 1190, netSubtotal: 1000 }),
  ],
  totals: { documents: 3, creditNotes: 1, invoicedTotal: 4760, invoicedSubtotal: 4000, creditedTotal: 1190, creditedSubtotal: 1000, netTotal: 3570, netSubtotal: 3000, netTax: 570, averageTicket: 1587, collected: 2380 },
  ...over,
})
const salesReportFixture = () => sales()
const topProducts = (): TopProductsReport => ({
  range: { from: '2026-11-01', to: '2026-11-23' }, rank: 'revenue', display,
  products: [
    { productId: 'p1', sku: 'COLA', description: 'Cola 1L', unit: 'un', quantity: 4, total: 4760, net: 4000 },
    { productId: null, sku: null, description: '=HYPERLINK("http://malo.example","clic")', unit: 'un', quantity: 1.5, total: 2000, net: 1681 },
  ],
})
const receivables = (): ReceivablesReport => ({
  asOf: '2026-11-24', display, documents: 3, total: 4760, overdueDocuments: 2, overdue: 3570,
  aging: [
    { bucket: 'current', documents: 1, amount: 1190 }, { bucket: 'd1_30', documents: 0, amount: 0 }, { bucket: 'd31_60', documents: 1, amount: 1190 },
    { bucket: 'd61_90', documents: 0, amount: 0 }, { bucket: 'd90_plus', documents: 1, amount: 2380 },
  ],
  debtors: [
    { customerId: 'c1', name: 'Ana Pérez', documents: 2, amount: 3570, oldestDueDate: '2026-10-01' },
    { customerId: null, name: 'Consumidor final', documents: 1, amount: 1190, oldestDueDate: null },
  ],
})

const payments = (over: Partial<PaymentsReport> = {}): PaymentsReport => ({
  range: { from: '2026-11-01', to: '2026-11-23' }, display, payments: 7, total: 85000,
  methods: [
    { method: 'card', payments: 2, amount: 50000 },
    { method: 'transfer', payments: 1, amount: 25000 },
    { method: 'cash', payments: 4, amount: 10000 },
  ],
  ...over,
})

async function open(data: ReportExport) {
  const workbook = new ExcelJS.Workbook()
  // Los tipos de exceljs piden su propio Buffer; el de Node es el mismo contenido
  await workbook.xlsx.load((await buildReportWorkbook(data, meta)) as unknown as ExcelJS.Buffer)
  return workbook
}
const rowsOf = (sheet: ExcelJS.Worksheet) => {
  const out: Record<number, ExcelJS.CellValue[]> = {}
  sheet.eachRow((row, n) => (out[n] = (row.values as ExcelJS.CellValue[]).slice(1)))
  return out
}
const findRow = (sheet: ExcelJS.Worksheet, first: unknown) => {
  let found: ExcelJS.Row | undefined
  sheet.eachRow((row) => {
    if (!found && row.getCell(1).value === first) found = row
  })
  return found
}

describe('moneyFormat', () => {
  it('usa los decimales de la moneda y pinta los negativos de rojo', () => {
    expect(moneyFormat(0)).toBe('#,##0;[Red]-#,##0')
    expect(moneyFormat(2)).toBe('#,##0.00;[Red]-#,##0.00')
  })
})

describe('buildReportWorkbook · ventas', () => {
  it('es un .xlsx válido con una hoja "Ventas" y datos del archivo', async () => {
    const buffer = await buildReportWorkbook({ tab: 'ventas', report: sales() }, meta)
    expect(buffer.subarray(0, 2).toString()).toBe('PK') // un .xlsx es un zip
    const workbook = await open({ tab: 'ventas', report: sales() })
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Ventas'])
    expect(workbook.creator).toBe('Acme SpA')
    expect(workbook.title).toBe('Reporte de ventas')
  })

  it('el encabezado dice qué empresa, qué período y en qué moneda', async () => {
    const sheet = (await open({ tab: 'ventas', report: sales() })).getWorksheet('Ventas')!
    const text = rowsOf(sheet)
    expect(text[1][0]).toBe('Reporte de ventas')
    expect(text[2][0]).toBe('Acme SpA')
    expect(text[3][0]).toBe('Período: 2026-11-20 al 2026-11-23 (por día)')
    expect(String(text[4][0])).toContain('Moneda: CLP')
    expect(String(text[5][0])).toMatch(/^Generado: .*2026/)
  })

  it('las cifras clave son números, no texto', async () => {
    const sheet = (await open({ tab: 'ventas', report: sales() })).getWorksheet('Ventas')!
    expect(findRow(sheet, 'Ventas netas (con impuesto)')!.getCell(2).value).toBe(3570)
    expect(findRow(sheet, 'Neto sin impuesto')!.getCell(2).value).toBe(3000)
    expect(findRow(sheet, 'Impuesto neto')!.getCell(2).value).toBe(570)
    expect(findRow(sheet, 'Documentos emitidos')!.getCell(2).value).toBe(3)
    expect(findRow(sheet, 'Ticket promedio')!.getCell(2).value).toBe(1587)
    expect(findRow(sheet, 'Monto acreditado')!.getCell(2).value).toBe(1190)
    expect(findRow(sheet, 'Cobrado en el período')!.getCell(2).value).toBe(2380)
  })

  it('la tabla lista solo los días con movimiento, con fechas reales y montos numéricos', async () => {
    const sheet = (await open({ tab: 'ventas', report: sales() })).getWorksheet('Ventas')!
    const header = findRow(sheet, 'Día')!
    const body = [header.number + 1, header.number + 2, header.number + 3].map((n) => sheet.getRow(n))
    expect(body.map((r) => (r.getCell(1).value as Date).toISOString().slice(0, 10))).toEqual(['2026-11-20', '2026-11-22', '2026-11-23']) // el 21 no tuvo nada
    expect(body[0].getCell(1).numFmt).toBe('dd-mm-yyyy')
    expect(body[0].getCell(2).value).toBe(2)
    expect(body[0].getCell(3).value).toBe(3570)
    expect(body[1].getCell(6).value).toBe(1190) // acreditado
    expect(body[1].getCell(8).value).toBe(-1190) // el día de devoluciones queda negativo
    expect(body[1].getCell(8).numFmt).toContain('[Red]')
  })

  it('el total son fórmulas con su resultado ya calculado', async () => {
    const sheet = (await open({ tab: 'ventas', report: sales() })).getWorksheet('Ventas')!
    const header = findRow(sheet, 'Día')!
    const total = findRow(sheet, 'Total')!
    expect(total.getCell(2).value).toEqual({ formula: `SUM(B${header.number + 1}:B${header.number + 3})`, result: 3 })
    expect(total.getCell(8).value).toEqual({ formula: `SUM(H${header.number + 1}:H${header.number + 3})`, result: 3570 })
    expect(total.font?.bold).toBe(true)
  })

  it('en rangos largos los períodos son meses', async () => {
    const report = sales({
      granularity: 'month',
      points: [point({ bucket: '2026-10', documents: 1, invoicedTotal: 100, invoicedSubtotal: 84, netTotal: 100, netSubtotal: 84 })],
    })
    const sheet = (await open({ tab: 'ventas', report })).getWorksheet('Ventas')!
    const header = findRow(sheet, 'Mes')!
    expect((sheet.getRow(header.number + 1).getCell(1).value as Date).toISOString().slice(0, 7)).toBe('2026-10')
    expect(sheet.getRow(header.number + 1).getCell(1).numFmt).toBe('mmmm yyyy')
    expect(String(rowsOf(sheet)[3][0])).toContain('(por mes)')
  })

  it('usa los decimales de la moneda en el formato de las celdas', async () => {
    const usd = sales({ display: { ...display, currency: 'USD', currencyDecimals: 2 } })
    const sheet = (await open({ tab: 'ventas', report: usd })).getWorksheet('Ventas')!
    expect(findRow(sheet, 'Ventas netas (con impuesto)')!.getCell(2).numFmt).toBe('#,##0.00;[Red]-#,##0.00')
    expect(findRow(sheet, 'Documentos emitidos')!.getCell(2).numFmt).toBe('#,##0') // las cantidades nunca llevan decimales
  })

  it('sin movimiento no inventa fórmulas sobre rangos vacíos', async () => {
    const empty = sales({ points: [point({ bucket: '2026-11-20' })], totals: { ...sales().totals, documents: 0, creditNotes: 0, invoicedTotal: 0, invoicedSubtotal: 0, creditedTotal: 0, creditedSubtotal: 0, netTotal: 0, netSubtotal: 0, netTax: 0, averageTicket: 0, collected: 0 } })
    const sheet = (await open({ tab: 'ventas', report: empty })).getWorksheet('Ventas')!
    expect(findRow(sheet, 'Total')!.getCell(2).value).toBe(0)
  })
})

describe('buildReportWorkbook · productos', () => {
  it('lista los productos con su posición, cantidad e importes numéricos', async () => {
    const sheet = (await open({ tab: 'productos', report: topProducts() })).getWorksheet('Productos')!
    expect(String(rowsOf(sheet)[1][0])).toBe('Productos más vendidos (por importe)')
    const header = findRow(sheet, 'N°')!
    expect(sheet.getRow(header.number + 1).values).toEqual([undefined, 1, 'Cola 1L', 'COLA', 'un', 4, 4760, 4000])
    expect(sheet.getRow(header.number + 2).getCell(3).value).toBe('Concepto libre')
    expect(sheet.getRow(header.number + 2).getCell(5).value).toBe(1.5)
  })

  it('un texto que parece fórmula se guarda como texto, no se ejecuta', async () => {
    const sheet = (await open({ tab: 'productos', report: topProducts() })).getWorksheet('Productos')!
    const cell = sheet.getRow(findRow(sheet, 'N°')!.number + 2).getCell(2)
    expect(cell.type).toBe(ExcelJS.ValueType.String)
    expect(cell.value).toBe('=HYPERLINK("http://malo.example","clic")')
  })

  it('el título dice por qué cantidad se ordenó', async () => {
    const report: TopProductsReport = { ...topProducts(), rank: 'quantity' }
    const sheet = (await open({ tab: 'productos', report })).getWorksheet('Productos')!
    expect(String(rowsOf(sheet)[1][0])).toBe('Productos más vendidos (por cantidad)')
  })

  it('sin productos queda solo el encabezado', async () => {
    const sheet = (await open({ tab: 'productos', report: { ...topProducts(), products: [] } })).getWorksheet('Productos')!
    expect(findRow(sheet, 'N°')).toBeTruthy()
    expect(sheet.autoFilter).toBeUndefined()
  })
})

describe('buildReportWorkbook · cobros', () => {
  it('una hoja "Cobros" con el título del archivo y el encabezado', async () => {
    const book = await open({ tab: 'cobros', report: payments() })
    expect(book.title).toBe('Cobros por forma de pago')
    const sheet = book.getWorksheet('Cobros')!
    expect(rowsOf(sheet)[1][0]).toBe('Cobros por forma de pago')
    expect(rowsOf(sheet)[3][0]).toBe('Período: 2026-11-01 al 2026-11-23')
  })

  it('una fila por forma de pago con cantidad, monto y porcentaje como números', async () => {
    const sheet = (await open({ tab: 'cobros', report: payments() })).getWorksheet('Cobros')!
    expect(findRow(sheet, 'Tarjeta')!.values).toEqual([undefined, 'Tarjeta', 2, 50000, 50000 / 85000])
    expect(findRow(sheet, 'Efectivo')!.getCell(3).value).toBe(10000)
    expect(findRow(sheet, 'Tarjeta')!.getCell(4).numFmt).toBe('0.0%')
    expect(findRow(sheet, 'Tarjeta')!.getCell(3).numFmt).toBe(moneyFormat(0))
  })

  it('el total son fórmulas con su resultado ya calculado', async () => {
    const sheet = (await open({ tab: 'cobros', report: payments() })).getWorksheet('Cobros')!
    const total = findRow(sheet, 'Total')!
    expect(total.getCell(2).value).toMatchObject({ result: 7 })
    expect(total.getCell(3).value).toMatchObject({ result: 85000 })
    expect((total.getCell(3).value as { formula: string }).formula).toMatch(/^SUM\(C\d+:C\d+\)$/)
    expect(total.getCell(4).value).toMatchObject({ result: 1 })
  })

  it('sin cobros no inventa fórmulas sobre rangos vacíos', async () => {
    const sheet = (await open({ tab: 'cobros', report: payments({ payments: 0, total: 0, methods: [] }) })).getWorksheet('Cobros')!
    const total = findRow(sheet, 'Total')!
    expect(total.getCell(2).value).toBe(0)
    expect(total.getCell(3).value).toBe(0)
  })

  it('usa los decimales de la moneda', async () => {
    const usd = { ...display, currency: 'USD', currencyDecimals: 2 }
    const sheet = (await open({ tab: 'cobros', report: payments({ display: usd }) })).getWorksheet('Cobros')!
    expect(findRow(sheet, 'Tarjeta')!.getCell(3).numFmt).toBe(moneyFormat(2))
  })
})

describe('buildReportWorkbook · por cobrar', () => {
  it('resumen, tramos y deudores', async () => {
    const sheet = (await open({ tab: 'cobrar', report: receivables() })).getWorksheet('Por cobrar')!
    expect(findRow(sheet, 'Por cobrar')!.getCell(2).value).toBe(4760)
    expect(findRow(sheet, 'Vencido')!.getCell(2).value).toBe(3570)
    expect(findRow(sheet, 'Documentos vencidos')!.getCell(2).value).toBe(2)
    expect(findRow(sheet, 'Al día')!.values).toEqual([undefined, 'Al día', 1, 1190])
    expect(findRow(sheet, 'Más de 90 días')!.values).toEqual([undefined, 'Más de 90 días', 1, 2380])
    expect(findRow(sheet, 'Ana Pérez')!.getCell(3).value).toBe(3570)
    expect((findRow(sheet, 'Ana Pérez')!.getCell(4).value as Date).toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it('incluye también los tramos vacíos y dice cuando no hay fecha de vencimiento', async () => {
    const sheet = (await open({ tab: 'cobrar', report: receivables() })).getWorksheet('Por cobrar')!
    expect(findRow(sheet, '61 a 90 días')!.values).toEqual([undefined, '61 a 90 días', 0, 0])
    expect(findRow(sheet, 'Consumidor final')!.getCell(4).value).toBe('Sin fecha')
  })

  it('la fecha de corte va en el encabezado', async () => {
    const sheet = (await open({ tab: 'cobrar', report: receivables() })).getWorksheet('Por cobrar')!
    expect(rowsOf(sheet)[3][0]).toBe('Al 2026-11-24')
  })
})

describe('buildReportWorkbook · zona horaria del servidor', () => {
  const original = process.env.TZ
  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  // Un servidor en una zona al este de UTC correría un día cualquier fecha escrita como "medianoche local"
  it.each(['Asia/Tokyo', 'Pacific/Auckland', 'America/Santiago', 'UTC'])('las fechas salen igual con el servidor en %s', async (tz) => {
    process.env.TZ = tz
    const sales = await open({ tab: 'ventas', report: salesReportFixture() })
    const sheet = sales.getWorksheet('Ventas')!
    const header = findRow(sheet, 'Día')!
    expect([1, 2, 3].map((n) => (sheet.getRow(header.number + n).getCell(1).value as Date).toISOString().slice(0, 10))).toEqual(['2026-11-20', '2026-11-22', '2026-11-23'])

    const debt = (await open({ tab: 'cobrar', report: receivables() })).getWorksheet('Por cobrar')!
    expect((findRow(debt, 'Ana Pérez')!.getCell(4).value as Date).toISOString().slice(0, 10)).toBe('2026-10-01')
  })
})
