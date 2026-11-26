// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportData } from '../types/report'
import { ExportMenu } from './ExportMenu'
import { productsReport, receivablesReport, salesReport } from './fixtures.test-util'

const print = vi.fn()
const HREF = '/dashboard/acme/finanzas/reportes/exportar?tab=productos&periodo=30d'

const setup = (data: ReportData = { tab: 'ventas', report: salesReport() }) => {
  const user = userEvent.setup({ pointerEventsCheck: 0, delay: null })
  render(<ExportMenu data={data} companyName="Acme SpA" excelHref={HREF} print={print} />)
  return { user }
}
const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Exportar' }))

beforeEach(() => print.mockClear())
afterEach(cleanup)

describe('ExportMenu', () => {
  it('ofrece imprimir/PDF y Excel', async () => {
    const { user } = setup()
    await open(user)
    expect(await screen.findByRole('menuitem', { name: 'Imprimir o guardar como PDF' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Descargar Excel (.xlsx)' })).toBeTruthy()
  })

  it('imprimir arma el documento del reporte con el nombre de la empresa y lo manda a imprimir', async () => {
    const { user } = setup()
    await open(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Imprimir o guardar como PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
    const html = print.mock.calls[0][0] as string
    expect(html).toContain('<title>Reporte de ventas — Acme SpA</title>')
    expect(html).toContain('Detalle por día')
  })

  it.each([
    ['productos', { tab: 'productos', report: productsReport() } as ReportData, 'Productos más vendidos (por importe) — Acme SpA'],
    ['por cobrar', { tab: 'cobrar', report: receivablesReport() } as ReportData, 'Cuentas por cobrar — Acme SpA'],
  ])('imprime el reporte de %s', async (_name, data, title) => {
    const { user } = setup(data)
    await open(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Imprimir o guardar como PDF' }))
    expect(print.mock.calls[0][0]).toContain(`<title>${title}</title>`)
  })

  it('Excel es una descarga del servidor con los mismos parámetros de la pantalla', async () => {
    const { user } = setup()
    await open(user)
    const link = await screen.findByRole('menuitem', { name: 'Descargar Excel (.xlsx)' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe(HREF)
    expect(link.hasAttribute('download')).toBe(true)
    expect(print).not.toHaveBeenCalled()
  })

  it('sin reporte (por ejemplo, un error de fechas) no hay qué exportar', async () => {
    setup({ tab: 'ventas', error: 'El rango máximo es de un año' })
    expect((screen.getByRole('button', { name: 'Exportar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(print).not.toHaveBeenCalled()
  })
})
