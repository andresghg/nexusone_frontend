// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { emptySales, salesReport } from './fixtures.test-util'
import { SalesTab } from './SalesTab'

afterEach(cleanup)
// La etiqueta de una cifra es un <dt>; el mismo texto puede aparecer también en otras partes (tabla, títulos)
const term = (label: string) => screen.getAllByText(label).find((el) => el.tagName === 'DT')!
const value = (label: string) => term(label).parentElement!.querySelector('dd')!.textContent
const detail = (label: string) => term(label).parentElement!.querySelectorAll('dd')[1]?.textContent

describe('SalesTab', () => {
  it('muestra las cifras clave con la moneda de la empresa', () => {
    render(<SalesTab report={salesReport()} />)
    expect(value('Ventas netas')).toMatch(/\$\s?3\.570/)
    expect(detail('Ventas netas')).toMatch(/Neto sin impuesto: \$\s?3\.000 · Impuesto: \$\s?570/)
    expect(value('Documentos emitidos')).toBe('3')
    expect(detail('Documentos emitidos')).toMatch(/Ticket promedio \$\s?1\.587/)
    expect(value('Notas de crédito')).toMatch(/^−\$\s?1\.190/)
    expect(detail('Notas de crédito')).toBe('1 emitida')
    expect(value('Cobrado')).toMatch(/\$\s?2\.380/)
  })

  it('sin devoluciones lo dice en vez de mostrar un monto', () => {
    const base = salesReport()
    render(<SalesTab report={salesReport({ totals: { ...base.totals, creditNotes: 0, creditedTotal: 0 } })} />)
    expect(value('Notas de crédito')).toBe('0')
    expect(detail('Notas de crédito')).toBe('Sin devoluciones')
  })

  it('varias notas de crédito, en plural', () => {
    const base = salesReport()
    render(<SalesTab report={salesReport({ totals: { ...base.totals, creditNotes: 3 } })} />)
    expect(detail('Notas de crédito')).toBe('3 emitidas')
  })

  it('la tabla lista solo los días con movimiento, con su total al pie', () => {
    render(<SalesTab report={salesReport()} />)
    const table = screen.getByRole('table')
    const body = within(table).getAllByRole('row').slice(1, -1) // sin encabezado ni pie
    expect(body).toHaveLength(3) // el 21 no tuvo nada
    expect(within(body[0]).getByRole('rowheader').textContent).toMatch(/20.*nov/i)
    expect(within(body[0]).getAllByRole('cell')[0].textContent).toBe('2')
    const foot = within(table).getAllByRole('row').at(-1)!
    expect(within(foot).getByRole('rowheader').textContent).toBe('Total')
    expect(foot.textContent).toMatch(/\$\s?3\.570/)
  })

  it('un día con más devoluciones que ventas se ve en negativo y en rojo, no escondido', () => {
    render(<SalesTab report={salesReport()} />)
    const row = within(screen.getByRole('table')).getAllByRole('row')[2] // el 22
    const net = within(row).getAllByRole('cell').at(-1)!
    expect(net.textContent).toMatch(/-\$\s?1\.190|\$\s?-1\.190/) // es-CL escribe el signo después del $
    expect(net.className).toContain('text-destructive')
    expect(within(row).getAllByRole('cell')[2].textContent).toMatch(/^−\$\s?1\.190/) // la nota de crédito
  })

  it('la tabla tiene título accesible y encabezados de columna', () => {
    render(<SalesTab report={salesReport()} />)
    expect(screen.getByRole('table', { name: /Documentos, notas de crédito y ventas netas por día/ })).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Día', 'Documentos', 'Facturado', 'Notas de crédito', 'Ventas netas'])
  })

  it('el gráfico tiene una descripción en texto con el total, para quien no lo ve', () => {
    render(<SalesTab report={salesReport()} />)
    const chart = screen.getByRole('img')
    expect(chart.getAttribute('aria-label')).toMatch(/Gráfico de barras de ventas netas por día\. Total del período: \$\s?3\.570/)
  })

  it('en rangos largos habla de meses', () => {
    const base = salesReport()
    render(
      <SalesTab
        report={salesReport({
          granularity: 'month',
          points: [{ ...base.points[0], bucket: '2026-10' }, { ...base.points[3], bucket: '2026-11' }],
        })}
      />,
    )
    expect(screen.getByText('Ventas netas por mes')).toBeTruthy()
    expect(screen.getByText('Detalle por mes')).toBeTruthy()
    expect(screen.getAllByRole('columnheader')[0].textContent).toBe('Mes')
    expect(within(screen.getByRole('table')).getAllByRole('rowheader')[0].textContent).toMatch(/Octubre.*2026/)
  })

  it('sin ventas muestra un estado vacío que explica qué hacer', () => {
    render(<SalesTab report={emptySales()} />)
    expect(screen.getByText('Sin ventas en este período')).toBeTruthy()
    expect(screen.getByText(/Prueba con otro período/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('un período con solo notas de crédito no es "sin ventas"', () => {
    const base = salesReport()
    render(<SalesTab report={salesReport({ points: [base.points[2]] })} />)
    expect(screen.queryByText('Sin ventas en este período')).toBeNull()
    expect(screen.getByRole('table')).toBeTruthy()
  })
})
