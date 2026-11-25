// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { receivablesReport } from './fixtures.test-util'
import { ReceivablesTab } from './ReceivablesTab'

afterEach(cleanup)
const term = (label: string) => screen.getAllByText(label).find((el) => el.tagName === 'DT')!
const value = (label: string) => term(label).parentElement!.querySelector('dd')!
const detail = (label: string) => term(label).parentElement!.querySelectorAll('dd')[1]?.textContent

describe('ReceivablesTab · cifras', () => {
  it('lo que se debe y lo vencido, con cuántos documentos y qué parte es', () => {
    render(<ReceivablesTab report={receivablesReport()} />)
    expect(value('Por cobrar').textContent).toMatch(/\$\s?6\.140/)
    expect(detail('Por cobrar')).toMatch(/5 documentos con saldo, al 23 nov.*2026/i)
    expect(value('Vencido').textContent).toMatch(/\$\s?4\.950/)
    expect(detail('Vencido')).toBe('4 documentos (81 % de lo que se debe)')
  })

  it('lo vencido llama la atención (y no solo por el color: dice "Vencido")', () => {
    render(<ReceivablesTab report={receivablesReport()} />)
    expect(value('Vencido').className).toContain('text-destructive')
  })

  it('sin nada vencido no se pinta de alerta', () => {
    render(<ReceivablesTab report={receivablesReport({ overdue: 0, overdueDocuments: 0 })} />)
    expect(value('Vencido').className).not.toContain('text-destructive')
    expect(detail('Vencido')).toBe('Nada vencido')
  })

  it('singular', () => {
    render(<ReceivablesTab report={receivablesReport({ documents: 1, overdueDocuments: 1 })} />)
    expect(detail('Por cobrar')).toMatch(/^1 documento con saldo/)
    expect(detail('Vencido')).toMatch(/^1 documento \(/)
  })
})

describe('ReceivablesTab · antigüedad', () => {
  const rows = () => within(screen.getByRole('list', { name: 'Deuda por tramo de atraso' })).getAllByRole('listitem')

  it('muestra los cinco tramos, también los vacíos, con monto, documentos y porcentaje', () => {
    render(<ReceivablesTab report={receivablesReport()} />)
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringMatching(/Al día.*\$\s?1\.190.*1 doc\. · 19 %/),
      expect.stringMatching(/1 a 30 días de atraso.*\$\s?1\.380.*1 doc\. · 22 %/),
      expect.stringMatching(/31 a 60 días.*\$\s?1\.190.*1 doc\. · 19 %/),
      expect.stringMatching(/61 a 90 días.*\$\s?0.*0 doc\. · 0 %/),
      expect.stringMatching(/Más de 90 días.*\$\s?2\.380.*2 doc\. · 39 %/),
    ])
  })

  it('lo atrasado va en otro color que lo que está al día, pero el texto también lo dice', () => {
    render(<ReceivablesTab report={receivablesReport()} />)
    const bar = (row: HTMLElement) => row.querySelector('[aria-hidden] > div') as HTMLElement
    expect(bar(rows()[0]).className).toContain('bg-primary')
    expect(bar(rows()[1]).className).toContain('bg-destructive')
    expect(bar(rows()[0]).style.width).toBe('19%')
  })
})

describe('ReceivablesTab · quién debe', () => {
  const debtors = () => within(screen.getByRole('list', { name: 'Clientes con mayor deuda' })).getAllByRole('listitem')

  it('lista a los deudores en el orden recibido, con documentos y monto', () => {
    render(<ReceivablesTab report={receivablesReport()} />)
    expect(debtors()[0].textContent).toContain('Consumidor final')
    expect(debtors()[0].textContent).toContain('2 documentos')
    expect(debtors()[0].textContent).toMatch(/\$\s?2\.380/)
  })

  it('un deudor con deuda vencida lo dice con texto y con insignia', () => {
    render(<ReceivablesTab report={receivablesReport()} />)
    expect(debtors()[0].textContent).toMatch(/Vencido desde el 15 ago.*2026/i)
    expect(within(debtors()[0]).getByText('Vencido')).toBeTruthy()
  })

  it('uno que aún no vence dice cuándo vence y no lleva insignia', () => {
    render(<ReceivablesTab report={receivablesReport()} />)
    expect(debtors()[1].textContent).toMatch(/Vence el 10 dic.*2026/i)
    expect(within(debtors()[1]).queryByText('Vencido')).toBeNull()
  })

  it('sin fecha de vencimiento no inventa una', () => {
    render(<ReceivablesTab report={receivablesReport()} />)
    expect(debtors()[2].textContent).not.toMatch(/Vence|Vencido/)
    expect(debtors()[2].textContent).toContain('1 documento')
  })

  it('un vencimiento que es hoy todavía no está vencido', () => {
    const base = receivablesReport()
    render(<ReceivablesTab report={receivablesReport({ debtors: [{ ...base.debtors[0], oldestDueDate: '2026-11-23' }] })} />)
    expect(debtors()[0].textContent).toMatch(/Vence el 23 nov/i)
    expect(within(debtors()[0]).queryByText('Vencido')).toBeNull()
  })
})

describe('ReceivablesTab · vacío', () => {
  it('sin deudas lo celebra con una explicación y sin tablas vacías', () => {
    render(<ReceivablesTab report={receivablesReport({ documents: 0, total: 0, overdue: 0, overdueDocuments: 0, debtors: [] })} />)
    expect(screen.getByText('No hay nada por cobrar')).toBeTruthy()
    expect(screen.getByText(/Todos los documentos emitidos están cobrados o acreditados al 23 nov/i)).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
