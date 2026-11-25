// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { productsReport } from './fixtures.test-util'
import { ProductsTab } from './ProductsTab'

afterEach(cleanup)
const items = () => within(screen.getByRole('list', { name: 'Productos más vendidos' })).getAllByRole('listitem')

describe('ProductsTab', () => {
  it('lista los productos en el orden recibido, con SKU, cantidad e importe', () => {
    render(<ProductsTab report={productsReport()} />)
    const rows = items()
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Cola 1L')
    expect(rows[0].textContent).toContain('COLA · 4 un')
    expect(rows[0].textContent).toMatch(/\$\s?4\.760/)
    expect(rows[1].textContent).toContain('Agua 500ml')
  })

  it('un concepto libre se muestra como tal y respeta decimales de cantidad', () => {
    render(<ProductsTab report={productsReport()} />)
    expect(items()[2].textContent).toContain('Concepto libre · 1,5 un')
  })

  it('las barras son proporcionales al mayor y no se leen como dato (están ocultas a lectores de pantalla)', () => {
    render(<ProductsTab report={productsReport()} />)
    const bars = items().map((row) => row.querySelector('[aria-hidden]:last-child > div') as HTMLElement)
    expect(bars.map((bar) => bar.style.width)).toEqual(['100%', '84%', '42%']) // 4.760 / 4.000 / 2.000
  })

  it('por cantidad las barras miden unidades, no importe', () => {
    render(<ProductsTab report={productsReport({ rank: 'quantity' })} />)
    expect(screen.getByText('Más vendidos por cantidad')).toBeTruthy()
    const widths = items().map((row) => (row.querySelector('[aria-hidden]:last-child > div') as HTMLElement).style.width)
    expect(widths).toEqual(['40%', '100%', '15%']) // 4 / 10 / 1,5 unidades
  })

  it('por importe lo dice en el título', () => {
    render(<ProductsTab report={productsReport()} />)
    expect(screen.getByText('Más vendidos por importe')).toBeTruthy()
  })

  it('una barra nunca desaparece del todo aunque sea muy chica', () => {
    const base = productsReport()
    render(<ProductsTab report={productsReport({ products: [base.products[0], { ...base.products[1], total: 1 }] })} />)
    expect((items()[1].querySelector('[aria-hidden]:last-child > div') as HTMLElement).style.width).toBe('2%')
  })

  it('sin productos explica por qué', () => {
    render(<ProductsTab report={productsReport({ products: [] })} />)
    expect(screen.getByText('Sin productos vendidos en este período')).toBeTruthy()
    expect(screen.getByText(/totalmente acreditado/)).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('usa la moneda y el idioma de la empresa', () => {
    render(<ProductsTab report={productsReport({ display: { currency: 'USD', currencyDecimals: 2, locale: 'en-US', timezone: 'America/New_York' } })} />)
    expect(items()[0].textContent).toContain('$4,760.00')
    expect(items()[2].textContent).toContain('1.5 un')
  })
})
