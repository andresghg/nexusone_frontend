// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { paymentsReport } from './fixtures.test-util'
import { PaymentsTab } from './PaymentsTab'

afterEach(cleanup)
const term = (label: string) => screen.getAllByText(label).find((el) => el.tagName === 'DT')!
const value = (label: string) => term(label).parentElement!.querySelector('dd')!
const detail = (label: string) => term(label).parentElement!.querySelectorAll('dd')[1]?.textContent

describe('PaymentsTab', () => {
  it('muestra lo cobrado con la cantidad de cobros y el cobro promedio', () => {
    render(<PaymentsTab report={paymentsReport()} />)
    expect(value('Cobrado').textContent).toMatch(/\$\s?85\.000/)
    expect(detail('Cobrado')).toBe('7 cobros en el período')
    expect(value('Cobro promedio').textContent).toMatch(/\$\s?12\.143/) // 85.000 ÷ 7, redondeado a la moneda
  })

  it('un solo cobro va en singular', () => {
    render(<PaymentsTab report={paymentsReport({ payments: 1, total: 500, methods: [{ method: 'cash', payments: 1, amount: 500 }] })} />)
    expect(detail('Cobrado')).toBe('1 cobro en el período')
    expect(within(screen.getByRole('list', { name: 'Cobros por forma de pago' })).getByText(/1 cobro · 100 %/)).toBeTruthy()
  })

  it('lista cada forma de pago en el orden recibido, con su monto, cantidad y porcentaje', () => {
    render(<PaymentsTab report={paymentsReport()} />)
    const rows = within(screen.getByRole('list', { name: 'Cobros por forma de pago' })).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toMatch(/Tarjeta.*\$\s?50\.000.*2 cobros · 59 %/)
    expect(rows[1].textContent).toMatch(/Transferencia.*\$\s?25\.000.*1 cobro · 29 %/)
    expect(rows[2].textContent).toMatch(/Efectivo.*\$\s?10\.000.*4 cobros · 12 %/)
  })

  it('la barra de cada forma de pago es proporcional a su parte del total', () => {
    const { container } = render(<PaymentsTab report={paymentsReport()} />)
    const widths = [...container.querySelectorAll<HTMLElement>('li [style]')].map((el) => el.style.width)
    expect(widths).toEqual(['59%', '29%', '12%'])
  })

  it('aclara qué cuenta y qué no (fecha de cobro, anulados y devoluciones)', () => {
    render(<PaymentsTab report={paymentsReport()} />)
    expect(screen.getByText(/por la fecha en que se cobraron/).textContent).toMatch(/anulados no suman/)
    expect(screen.getByText(/por la fecha en que se cobraron/).textContent).toMatch(/devoluciones de dinero/)
  })

  it('sin cobros muestra un mensaje en vez de una tabla vacía', () => {
    render(<PaymentsTab report={paymentsReport({ payments: 0, total: 0, methods: [] })} />)
    expect(screen.getByText('No hay cobros en este período')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
