import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DISPLAY_FORMAT } from '@/features/billing/types/billing'
import type { ReceivablesReport, SalesReport, TopProductsReport } from '../types/report'
import { parseReportParams } from '../utils/reportParams'
import { loadReport } from './loadReport'
import type { ReportService } from './ReportService'

const display = DEFAULT_DISPLAY_FORMAT
const today = '2026-11-23'

function fake(over: { context?: unknown; sales?: unknown; products?: unknown; receivables?: unknown } = {}) {
  const service = {
    context: vi.fn().mockResolvedValue('context' in over ? over.context : { display, today }),
    sales: vi.fn().mockResolvedValue(over.sales ?? { report: { tag: 'ventas' } as unknown as SalesReport }),
    topProducts: vi.fn().mockResolvedValue(over.products ?? { report: { tag: 'productos' } as unknown as TopProductsReport }),
    receivables: vi.fn().mockResolvedValue(over.receivables ?? { report: { tag: 'cobrar' } as unknown as ReceivablesReport }),
  }
  return { service, run: (params: Record<string, string>, limit = 20) => loadReport('u1', 'org-1', parseReportParams(params), { productLimit: limit }, service as unknown as ReportService) }
}

describe('loadReport', () => {
  it('ventas: consulta el período resuelto con el "hoy" de la empresa', async () => {
    const { service, run } = fake()
    const result = await run({ periodo: '7d' })
    expect(service.sales).toHaveBeenCalledWith('u1', 'org-1', { from: '2026-11-17', to: '2026-11-23' })
    expect(result).toMatchObject({ status: 'ok', today, display, range: { from: '2026-11-17', to: '2026-11-23' }, data: { tab: 'ventas' } })
    expect(service.topProducts).not.toHaveBeenCalled()
    expect(service.receivables).not.toHaveBeenCalled() // solo se consulta la pestaña activa
  })

  it('productos: pasa el orden y el límite pedidos', async () => {
    const { service, run } = fake()
    await run({ tab: 'productos', periodo: 'hoy', orden: 'cantidad' }, 200)
    expect(service.topProducts).toHaveBeenCalledWith('u1', 'org-1', { from: today, to: today, rank: 'quantity', limit: 200 })
    await run({ tab: 'productos' }, 20)
    expect(service.topProducts.mock.calls[1][2]).toMatchObject({ rank: 'revenue', limit: 20 })
  })

  it('por cobrar no usa período, ni siquiera uno inválido', async () => {
    const { service, run } = fake()
    const result = await run({ tab: 'cobrar', periodo: 'personalizado', desde: '2026-12-01', hasta: '2026-01-01' })
    expect(result.status).toBe('ok')
    expect(service.receivables).toHaveBeenCalledWith('u1', 'org-1')
    expect(result.data).toMatchObject({ tab: 'cobrar' })
  })

  it('un período personalizado inválido no consulta y lo dice', async () => {
    const { service, run } = fake()
    const result = await run({ periodo: 'personalizado', desde: '2026-11-30', hasta: '2026-11-01' })
    expect(result.status).toBe('invalid')
    expect(result.data).toEqual({ tab: 'ventas', error: 'La fecha de inicio no puede ser posterior a la de término' })
    expect(result.range).toEqual({ from: '2026-11-01', to: today }) // mientras tanto, el mes en curso
    expect(service.sales).not.toHaveBeenCalled()
    const products = await run({ tab: 'productos', periodo: 'personalizado' })
    expect(products.data).toEqual({ tab: 'productos', error: 'Elige la fecha de inicio y la de término' })
    expect(service.topProducts).not.toHaveBeenCalled()
  })

  it('sin permiso de reportes: "forbidden" y no consulta nada', async () => {
    const { service, run } = fake({ context: null })
    const result = await run({})
    expect(result).toMatchObject({ status: 'forbidden', data: { tab: 'ventas', error: 'No tienes permisos para ver los reportes' } })
    expect(service.sales).not.toHaveBeenCalled()
  })

  it('un error del servicio se entrega tal cual, en la pestaña pedida', async () => {
    const { run } = fake({ sales: { error: 'boom' }, products: { error: 'p' }, receivables: { error: 'r' } })
    expect((await run({})).data).toEqual({ tab: 'ventas', error: 'boom' })
    expect((await run({ tab: 'productos' })).data).toEqual({ tab: 'productos', error: 'p' })
    expect((await run({ tab: 'cobrar' })).data).toEqual({ tab: 'cobrar', error: 'r' })
  })
})
