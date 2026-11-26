import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DISPLAY_FORMAT } from '@/features/billing/types/billing'
import type { PaymentsReport, ReceivablesReport, SalesReport, TopProductsReport } from '../types/report'
import { GET } from '../../../../app/dashboard/[slug]/finanzas/reportes/exportar/route'

const { access, service } = vi.hoisted(() => ({
  access: vi.fn(),
  service: { context: vi.fn(), sales: vi.fn(), topProducts: vi.fn(), payments: vi.fn(), receivables: vi.fn() },
}))
vi.mock('@/features/organization/utils/getCurrentAccess', () => ({ getCurrentAccess: access }))
vi.mock('./ReportService', () => ({ reportService: service }))

const display = DEFAULT_DISPLAY_FORMAT
const salesReport: SalesReport = {
  range: { from: '2026-11-01', to: '2026-11-23' }, granularity: 'day', display,
  points: [{ bucket: '2026-11-20', documents: 2, invoicedTotal: 3570, invoicedSubtotal: 3000, creditNotes: 0, creditedTotal: 0, creditedSubtotal: 0, netTotal: 3570, netSubtotal: 3000 }],
  totals: { documents: 2, creditNotes: 0, invoicedTotal: 3570, invoicedSubtotal: 3000, creditedTotal: 0, creditedSubtotal: 0, netTotal: 3570, netSubtotal: 3000, netTax: 570, averageTicket: 1785, collected: 0 },
}
const productsReport: TopProductsReport = { range: { from: '2026-11-24', to: '2026-11-24' }, rank: 'quantity', display, products: [] }
const paymentsReport: PaymentsReport = {
  range: { from: '2026-11-01', to: '2026-11-24' }, display, payments: 1, total: 500, methods: [{ method: 'cash', payments: 1, amount: 500 }],
}
const receivablesReport: ReceivablesReport = {
  asOf: '2026-11-24', display, documents: 0, total: 0, overdueDocuments: 0, overdue: 0,
  aging: [{ bucket: 'current', documents: 0, amount: 0 }, { bucket: 'd1_30', documents: 0, amount: 0 }, { bucket: 'd31_60', documents: 0, amount: 0 }, { bucket: 'd61_90', documents: 0, amount: 0 }, { bucket: 'd90_plus', documents: 0, amount: 0 }],
  debtors: [],
}

const call = (query = '') =>
  GET(new Request(`http://localhost/dashboard/acme/finanzas/reportes/exportar${query}`), { params: Promise.resolve({ slug: 'acme' }) })

beforeEach(() => {
  vi.clearAllMocks()
  access.mockResolvedValue({ user: { id: 'u1' }, organization: { id: 'org-1', name: 'Acme SpA' }, permissions: ['finanzas.reportes.read'] })
  service.context.mockResolvedValue({ display, today: '2026-11-24' })
  service.sales.mockResolvedValue({ report: salesReport })
  service.topProducts.mockResolvedValue({ report: productsReport })
  service.payments.mockResolvedValue({ report: paymentsReport })
  service.receivables.mockResolvedValue({ report: receivablesReport })
})

async function workbook(response: Response) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as unknown as ExcelJS.Buffer)
  return book
}

describe('descarga de Excel', () => {
  it('entrega el .xlsx con las cabeceras de una descarga y sin guardarse en cachés', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="reporte-ventas_2026-11-01_2026-11-24.xlsx"')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const book = await workbook(response)
    expect(book.creator).toBe('Acme SpA')
    expect(book.getWorksheet('Ventas')).toBeTruthy()
  })

  it('usa los mismos parámetros de la pantalla: mes en curso por defecto', async () => {
    await call()
    expect(service.sales).toHaveBeenCalledWith('u1', 'org-1', { from: '2026-11-01', to: '2026-11-24' })
  })

  it('productos: trae hasta 200 y respeta el orden y el período', async () => {
    const response = await call('?tab=productos&periodo=hoy&orden=cantidad')
    expect(service.topProducts).toHaveBeenCalledWith('u1', 'org-1', { from: '2026-11-24', to: '2026-11-24', rank: 'quantity', limit: 200 })
    expect(response.headers.get('Content-Disposition')).toContain('reporte-productos_2026-11-24.xlsx')
    expect((await workbook(response)).getWorksheet('Productos')).toBeTruthy()
  })

  it('cobros: usa el período de la pantalla y descarga la hoja de cobros', async () => {
    const response = await call('?tab=cobros&periodo=hoy')
    expect(service.payments).toHaveBeenCalledWith('u1', 'org-1', { from: '2026-11-24', to: '2026-11-24' })
    expect(response.headers.get('Content-Disposition')).toContain('reporte-cobros_2026-11-24.xlsx')
    expect((await workbook(response)).getWorksheet('Cobros')).toBeTruthy()
  })

  it('por cobrar lleva la fecha de corte en el nombre', async () => {
    const response = await call('?tab=cobrar')
    expect(response.headers.get('Content-Disposition')).toContain('reporte-por-cobrar_2026-11-24.xlsx')
    expect((await workbook(response)).getWorksheet('Por cobrar')).toBeTruthy()
  })

  it('sin permiso de reportes responde 403 y no consulta nada', async () => {
    access.mockResolvedValue({ user: { id: 'u1' }, organization: { id: 'org-1', name: 'Acme' }, permissions: ['pos.facturacion.read'] })
    const response = await call()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'No tienes permisos para ver los reportes' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(service.context).not.toHaveBeenCalled()
    expect(service.sales).not.toHaveBeenCalled()
  })

  it('si el servicio niega el acceso responde 403', async () => {
    service.context.mockResolvedValue(null)
    expect((await call()).status).toBe(403)
  })

  it('un período inválido responde 400 con el motivo, sin generar archivo', async () => {
    const response = await call('?periodo=personalizado&desde=2026-11-30&hasta=2026-11-01')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'La fecha de inicio no puede ser posterior a la de término' })
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(service.sales).not.toHaveBeenCalled()
  })

  it('un error de la consulta responde 500', async () => {
    service.sales.mockResolvedValue({ error: 'boom' })
    const response = await call()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'boom' })
  })

  it('sin sesión o sin acceso a la empresa se comporta como la página (no genera nada)', async () => {
    access.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(call()).rejects.toThrow('NEXT_REDIRECT')
    expect(service.sales).not.toHaveBeenCalled()
  })

  it('el nombre de archivo nunca lleva texto de la URL', async () => {
    const response = await call('?tab=ventas&periodo=hoy"%0d%0aX-Evil:1')
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="reporte-ventas_[0-9_-]+\.xlsx"$/)
    expect([...response.headers.keys()]).not.toContain('x-evil')
  })
})
