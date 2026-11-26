import { describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_FORMAT } from '@/features/billing/types/billing'
import type { PaymentsReport, ReceivablesReport, ReportExportMeta, SalesPoint, SalesReport, TopProductsReport } from '../types/report'
import { buildReportHtml, salesChartSvg } from './reportHtml'

const display = DEFAULT_DISPLAY_FORMAT
const meta: ReportExportMeta = { companyName: 'Acme SpA', generatedAt: new Date('2026-11-24T15:00:00Z') }
const flat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const point = (over: Partial<SalesPoint> & { bucket: string }): SalesPoint => ({
  documents: 0, invoicedTotal: 0, invoicedSubtotal: 0, creditNotes: 0, creditedTotal: 0, creditedSubtotal: 0, netTotal: 0, netSubtotal: 0, ...over,
})
const sales = (over: Partial<SalesReport> = {}): SalesReport => ({
  range: { from: '2026-11-20', to: '2026-11-23' }, granularity: 'day', display,
  points: [
    point({ bucket: '2026-11-20', documents: 2, invoicedTotal: 3570, invoicedSubtotal: 3000, netTotal: 3570, netSubtotal: 3000 }),
    point({ bucket: '2026-11-21' }),
    point({ bucket: '2026-11-22', creditNotes: 1, creditedTotal: 1190, creditedSubtotal: 1000, netTotal: -1190, netSubtotal: -1000 }),
    point({ bucket: '2026-11-23', documents: 1, invoicedTotal: 1190, invoicedSubtotal: 1000, netTotal: 1190, netSubtotal: 1000 }),
  ],
  totals: { documents: 3, creditNotes: 1, invoicedTotal: 4760, invoicedSubtotal: 4000, creditedTotal: 1190, creditedSubtotal: 1000, netTotal: 3570, netSubtotal: 3000, netTax: 570, averageTicket: 1587, collected: 2380 },
  ...over,
})
const products = (): TopProductsReport => ({
  range: { from: '2026-11-01', to: '2026-11-23' }, rank: 'revenue', display,
  products: [
    { productId: 'p1', sku: 'COLA', description: 'Cola 1L', unit: 'un', quantity: 4, total: 4760, net: 4000 },
    { productId: null, sku: null, description: 'Flete <b>especial</b>', unit: 'un', quantity: 1.5, total: 2000, net: 1681 },
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
    { customerId: 'c2', name: 'Beto Soto', documents: 1, amount: 1190, oldestDueDate: '2026-12-10' },
    { customerId: null, name: 'Consumidor final', documents: 1, amount: 100, oldestDueDate: null },
  ],
})

describe('buildReportHtml · estructura', () => {
  it('es una página completa y autocontenida, sin recursos externos', () => {
    const html = buildReportHtml({ tab: 'ventas', report: sales() }, meta)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>Reporte de ventas — Acme SpA</title>')
    expect(html).toContain('@page { size: A4')
    expect(html).not.toMatch(/<script|<link|<img|src=|href=|url\(/i)
  })

  it('el encabezado dice la empresa, el período y la moneda; el pie, cuándo se generó', () => {
    const text = flat(buildReportHtml({ tab: 'ventas', report: sales() }, meta))
    expect(text).toContain('Acme SpA')
    expect(text).toMatch(/Del 20 nov.*2026 al 23 nov.*2026 · Montos en CLP/i)
    expect(text).toMatch(/Generado el .*24.*2026/)
  })

  it('un solo día se dice "El …"', () => {
    const html = buildReportHtml({ tab: 'ventas', report: sales({ range: { from: '2026-11-23', to: '2026-11-23' } }) }, meta)
    expect(flat(html)).toMatch(/El 23 nov.*2026 · Montos en CLP/i)
  })

  it('el texto que viene de la base se escapa: nada se ejecuta', () => {
    const html = buildReportHtml({ tab: 'productos', report: products() }, { ...meta, companyName: 'Acme <script>alert(1)</script> & Cía' })
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>especial</b>')
    expect(html).toContain('Flete &lt;b&gt;especial&lt;/b&gt;')
    expect(html).toContain('Acme &lt;script&gt;alert(1)&lt;/script&gt; &amp; Cía')
  })

  it('un idioma de la empresa inválido no impide imprimir', () => {
    expect(() => buildReportHtml({ tab: 'ventas', report: sales({ display: { ...display, locale: 'es C', timezone: 'Mars/Olympus' } }) }, meta)).not.toThrow()
  })
})

describe('buildReportHtml · ventas', () => {
  it('cifras clave, detalle de los días con movimiento y total', () => {
    const text = flat(buildReportHtml({ tab: 'ventas', report: sales() }, meta))
    expect(text).toMatch(/Ventas netas \$\s?3\.570/)
    expect(text).toMatch(/Neto sin impuesto \$\s?3\.000 · Impuesto \$\s?570/)
    expect(text).toMatch(/Documentos emitidos 3 Ticket promedio \$\s?1\.587/)
    expect(text).toMatch(/Notas de crédito −\$\s?1\.190 1 emitida/)
    expect(text).toMatch(/Cobrado \$\s?2\.380/)
    expect(text).toMatch(/Total 3 \$\s?4\.760 −\$\s?1\.190 \$\s?3\.570/)
  })

  it('la tabla solo trae los días con movimiento y marca en rojo el de devoluciones', () => {
    const html = buildReportHtml({ tab: 'ventas', report: sales() }, meta)
    const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'))
    expect(body.match(/<tr>/g)).toHaveLength(3) // el 21 no tuvo nada
    expect(body).toMatch(/class="num neg"/)
  })

  it('incluye el gráfico con su descripción', () => {
    const html = buildReportHtml({ tab: 'ventas', report: sales() }, meta)
    expect(html).toMatch(/<svg role="img" aria-label="Gráfico de ventas netas por día\. Total del período: \$\s?3\.570\."/)
  })

  it('en rangos largos habla de meses', () => {
    const html = buildReportHtml({ tab: 'ventas', report: sales({ granularity: 'month', points: [point({ bucket: '2026-10', documents: 1, invoicedTotal: 100, netTotal: 100 })] }) }, meta)
    expect(html).toContain('Ventas netas por mes')
    expect(flat(html)).toMatch(/Octubre.*2026/)
  })

  it('sin ventas lo dice en vez de imprimir tablas vacías', () => {
    const html = buildReportHtml({ tab: 'ventas', report: sales({ points: [point({ bucket: '2026-11-20' })] }) }, meta)
    expect(html).toContain('Sin ventas en este período.')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('<svg')
  })

  it('la tabla repite el encabezado en cada página y no parte una fila', () => {
    const html = buildReportHtml({ tab: 'ventas', report: sales() }, meta)
    expect(html).toContain('thead { display: table-header-group; }')
    expect(html).toContain('tr { break-inside: avoid; }')
  })
})

describe('salesChartSvg', () => {
  const pts = sales().points
  const rects = (svg: string) => [...svg.matchAll(/<rect [^>]*fill="(#[0-9a-f]+)"/g)].map((m) => m[1])

  it('una barra por período con valor, oscuras las positivas y rojas las negativas', () => {
    expect(rects(salesChartSvg(pts, 'day', 'es-CL', 'x'))).toEqual(['#1f2937', '#b91c1c', '#1f2937']) // el 21 vale cero: sin barra
  })

  it('las barras positivas quedan sobre la línea base y las negativas debajo', () => {
    const svg = salesChartSvg(pts, 'day', 'es-CL', 'x')
    const baseline = Number(/<line [^>]*y1="([\d.]+)"/.exec(svg)![1])
    const bars = [...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="(#[0-9a-f]+)"/g)].map((m) => ({ y: Number(m[1]), h: Number(m[2]), fill: m[3] }))
    for (const bar of bars) {
      if (bar.fill === '#1f2937') expect(bar.y + bar.h).toBeCloseTo(baseline, 0)
      else expect(bar.y).toBeCloseTo(baseline, 0)
    }
  })

  it('el alto de las barras es proporcional al valor', () => {
    const svg = salesChartSvg(pts, 'day', 'es-CL', 'x')
    const heights = [...svg.matchAll(/height="([\d.]+)" fill=/g)].map((m) => Number(m[1]))
    expect(heights[0] / heights[2]).toBeCloseTo(3570 / 1190, 1)
  })

  it('rotula solo el primer y el último período', () => {
    const svg = salesChartSvg(pts, 'day', 'es-CL', 'x')
    expect([...svg.matchAll(/<text [^>]*>([^<]+)<\/text>/g)].map((m) => m[1]).join('|')).toMatch(/20.*nov.*\|23.*nov/i)
  })

  it('un solo período y todo en cero no rompen el gráfico', () => {
    expect(() => salesChartSvg([point({ bucket: '2026-11-20' })], 'day', 'es-CL', 'x')).not.toThrow()
    expect(salesChartSvg([point({ bucket: '2026-11-20' })], 'day', 'es-CL', 'x')).not.toContain('NaN')
    expect(salesChartSvg([point({ bucket: '2026-11-20', netTotal: 5 })], 'day', 'es-CL', 'x')).not.toContain('NaN')
  })

  it('la descripción accesible se escapa', () => {
    expect(salesChartSvg(pts, 'day', 'es-CL', 'a "b" <c>')).toContain('aria-label="a &quot;b&quot; &lt;c&gt;"')
  })
})

describe('buildReportHtml · productos', () => {
  it('lista los productos con SKU, cantidad e importe', () => {
    const text = flat(buildReportHtml({ tab: 'productos', report: products() }, meta))
    expect(text).toContain('Productos más vendidos (por importe)')
    expect(text).toMatch(/1 Cola 1L COLA 4 un \$\s?4\.760/)
    expect(text).toMatch(/2 Flete .* Concepto libre 1,5 un \$\s?2\.000/)
  })
  it('por cantidad lo dice en el título', () => {
    expect(buildReportHtml({ tab: 'productos', report: { ...products(), rank: 'quantity' } }, meta)).toContain('Productos más vendidos (por cantidad)')
  })
  it('sin productos lo dice', () => {
    const html = buildReportHtml({ tab: 'productos', report: { ...products(), products: [] } }, meta)
    expect(html).toContain('Sin productos vendidos en este período.')
    expect(html).not.toContain('<table')
  })
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

describe('buildReportHtml · cobros', () => {
  it('lleva el período y el título propios', () => {
    const html = buildReportHtml({ tab: 'cobros', report: payments() }, meta)
    expect(html).toContain('<title>Cobros por forma de pago — Acme SpA</title>')
    expect(flat(html)).toMatch(/Del 1 nov.*2026 al 23 nov.*2026 · Montos en CLP/i)
  })

  it('cifras clave, una fila por forma de pago con su porcentaje y el total', () => {
    const text = flat(buildReportHtml({ tab: 'cobros', report: payments() }, meta))
    expect(text).toMatch(/Cobrado \$\s?85\.000 7 cobros en el período/)
    expect(text).toMatch(/Cobro promedio \$\s?12\.143/)
    expect(text).toMatch(/Tarjeta 2 \$\s?50\.000 59 %/)
    expect(text).toMatch(/Transferencia 1 \$\s?25\.000 29 %/)
    expect(text).toMatch(/Efectivo 4 \$\s?10\.000 12 %/)
    expect(text).toMatch(/Total 7 \$\s?85\.000 100 %/)
  })

  it('aclara qué cuenta y qué no', () => {
    const text = flat(buildReportHtml({ tab: 'cobros', report: payments() }, meta))
    expect(text).toMatch(/por la fecha en que se cobraron/)
    expect(text).toMatch(/cobros anulados no suman/)
  })

  it('un solo cobro va en singular', () => {
    const html = buildReportHtml({ tab: 'cobros', report: payments({ payments: 1, total: 500, methods: [{ method: 'cash', payments: 1, amount: 500 }] }) }, meta)
    expect(flat(html)).toMatch(/1 cobro en el período/)
  })

  it('sin cobros lo dice en vez de imprimir tablas vacías', () => {
    const html = buildReportHtml({ tab: 'cobros', report: payments({ payments: 0, total: 0, methods: [] }) }, meta)
    expect(flat(html)).toMatch(/Sin cobros en este período/)
    expect(html).not.toContain('<table')
  })
})

describe('buildReportHtml · por cobrar', () => {
  it('lleva la fecha de corte en vez de un período', () => {
    const text = flat(buildReportHtml({ tab: 'cobrar', report: receivables() }, meta))
    expect(text).toMatch(/Al 24 nov.*2026 · Montos en CLP/i)
    expect(text).not.toMatch(/Del .* al /)
  })
  it('cifras, tramos con porcentaje y deudores con su vencimiento', () => {
    const text = flat(buildReportHtml({ tab: 'cobrar', report: receivables() }, meta))
    expect(text).toMatch(/Por cobrar \$\s?4\.760 3 documentos con saldo/)
    expect(text).toMatch(/Vencido \$\s?3\.570 2 documentos/)
    expect(text).toMatch(/Al día 1 \$\s?1\.190 25 %/)
    expect(text).toMatch(/61 a 90 días 0 \$\s?0 0 %/)
    expect(text).toMatch(/Ana Pérez 2 Vencido desde el 1 oct.*2026 \$\s?3\.570/i)
    expect(text).toMatch(/Beto Soto 1 Vence el 10 dic.*2026/i)
    expect(text).toMatch(/Consumidor final 1 Sin fecha de vencimiento/)
  })
  it('un vencimiento que es hoy todavía no está vencido', () => {
    const base = receivables()
    const html = buildReportHtml({ tab: 'cobrar', report: { ...base, debtors: [{ ...base.debtors[0], oldestDueDate: '2026-11-24' }] } }, meta)
    expect(flat(html)).toMatch(/Vence el 24 nov.*2026/i)
    expect(html).not.toMatch(/<td class="neg">/)
  })
  it('lo vencido se marca en rojo', () => {
    const html = buildReportHtml({ tab: 'cobrar', report: receivables() }, meta)
    expect(html).toContain('<li class="warn">')
    expect(html).toMatch(/<td class="neg">Vencido desde/)
  })
  it('sin deudas lo dice', () => {
    const html = buildReportHtml({ tab: 'cobrar', report: { ...receivables(), documents: 0, total: 0, overdue: 0, overdueDocuments: 0, debtors: [] } }, meta)
    expect(flat(html)).toMatch(/No hay nada por cobrar al 24 nov.*2026/i)
    expect(html).not.toContain('<table')
  })
})
