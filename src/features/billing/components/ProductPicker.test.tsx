// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchProductsAction } from '../action/invoice-action'
import type { ProductOption } from '../types/invoice'
import type { MoneyFormat } from '../utils/formatMoney'
import { ProductPicker } from './ProductPicker'

vi.mock('../action/invoice-action', () => ({ searchProductsAction: vi.fn() }))

const ORG = '11111111-1111-4111-8111-111111111111'
const CLP: MoneyFormat = { currency: 'CLP', locale: 'es-CL', decimals: 0 }
const search = vi.mocked(searchProductsAction)

const cola: ProductOption = { id: 'p1', sku: 'COLA-1L', barcode: '7801234567890', name: 'Cola 1L', unit: 'un', price: 1190, taxRate: null, trackStock: true, stock: 8 }
const zero: ProductOption = { id: 'p2', sku: 'COLA-Z5', barcode: null, name: 'Cola Zero', unit: 'un', price: 890, taxRate: null, trackStock: true, stock: 0 }
const servicio: ProductOption = { id: 'p3', sku: 'SERV-1', barcode: null, name: 'Instalación', unit: 'un', price: 20000, taxRate: null, trackStock: false, stock: null }
const pan: ProductOption = { id: 'p4', sku: 'PAN', barcode: null, name: 'Pan de molde', unit: 'kg', price: 2500, taxRate: null, trackStock: true, stock: 3.5 }

const setup = (format: MoneyFormat = CLP) => {
  const onPick = vi.fn()
  // delay: null → sin pausa entre teclas, como un lector de códigos de barras
  const user = userEvent.setup({ pointerEventsCheck: 0, delay: null })
  render(<ProductPicker organizationId={ORG} format={format} onPick={onPick} />)
  return { user, onPick }
}
const input = () => screen.getByRole('combobox', { name: 'Buscar producto' })

beforeEach(() => {
  search.mockReset()
  search.mockResolvedValue({ error: '', products: [cola, zero, servicio, pan] })
})
afterEach(cleanup)

describe('ProductPicker', () => {
  it('al enfocar abre la lista y muestra los productos con precio y stock', async () => {
    const { user } = setup()
    await user.click(input())

    expect(await screen.findByText('Cola 1L')).toBeTruthy()
    expect(search).toHaveBeenCalledWith({ organizationId: ORG, query: '' })
    expect(screen.getByText('COLA-1L · 7801234567890')).toBeTruthy()
    expect(screen.getByText('$1.190')).toBeTruthy()
    expect(screen.getByText('Stock: 8 un')).toBeTruthy()
    expect(screen.getByText('Stock: 3.5 kg')).toBeTruthy()
    expect(screen.getByText('Sin stock').className).toContain('destructive')
    expect(screen.getByText('Sin control de stock')).toBeTruthy()
  })

  it('un producto exento lo dice; los demás no', async () => {
    search.mockResolvedValue({ error: '', products: [{ ...servicio, taxRate: 0 }, { ...pan, taxRate: 10 }, cola] })
    const { user } = setup()
    await user.click(input())
    expect(await screen.findByText('SERV-1 · Exento')).toBeTruthy()
    expect(screen.getByText('PAN')).toBeTruthy() // con tasa propia distinta de 0 no se marca
    expect(screen.queryAllByText(/Exento/)).toHaveLength(1)
  })

  it('el precio usa la moneda y el idioma de la empresa', async () => {
    const { user } = setup({ currency: 'USD', locale: 'en-US', decimals: 2 })
    await user.click(input())
    expect(await screen.findByText('$1,190.00')).toBeTruthy()
  })

  it('al escribir busca con ese texto, una vez, después de una pausa', async () => {
    const { user } = setup()
    await user.click(input())
    await screen.findByText('Cola 1L')
    search.mockClear()

    await user.type(input(), 'cola')
    await waitFor(() => expect(search).toHaveBeenCalledWith({ organizationId: ORG, query: 'cola' }))
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('al elegir un producto avisa, limpia el texto y cierra la lista', async () => {
    const { user, onPick } = setup()
    await user.click(input())
    await user.click(await screen.findByText('Cola 1L'))

    expect(onPick).toHaveBeenCalledWith(cola)
    expect((input() as HTMLInputElement).value).toBe('')
    await waitFor(() => expect(screen.queryByText('Cola Zero')).toBeNull())
  })

  it('se puede elegir con el teclado: flechas y Enter', async () => {
    const { user, onPick } = setup()
    await user.click(input())
    await screen.findByText('Cola 1L')

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].id).toBe('p2') // el primero está resaltado al abrir; una flecha baja al segundo
  })

  it('lector de códigos: escribir el código y Enter elige el producto sin esperar a la pausa', async () => {
    search.mockImplementation(async ({ query }) => ({
      error: '',
      products: query === '7801234567890' ? [cola] : [cola, zero, servicio, pan],
    }))
    const { user, onPick } = setup()
    await user.click(input())
    await screen.findByText('Cola 1L')

    await user.type(input(), '7801234567890{Enter}')

    await waitFor(() => expect(onPick).toHaveBeenCalledWith(cola))
    expect(onPick).toHaveBeenCalledTimes(1) // no elige también un resultado viejo de la lista anterior
    expect(search).toHaveBeenCalledWith({ organizationId: ORG, query: '7801234567890' })
  })

  it('lector de códigos: si el código coincide exacto con un SKU, elige ese aunque haya otros resultados', async () => {
    search.mockImplementation(async ({ query }) => ({
      error: '',
      products: query === 'COLA-Z5' ? [cola, zero] : [cola, zero],
    }))
    const { user, onPick } = setup()
    await user.click(input())
    await screen.findByText('Cola 1L')

    await user.type(input(), 'cola-z5{Enter}')
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(zero))
  })

  it('con varios resultados y ninguno exacto, Enter no elige nada por su cuenta', async () => {
    search.mockImplementation(async ({ query }) => ({
      error: '',
      products: query === 'cola' ? [cola, zero] : [cola, zero, servicio, pan],
    }))
    const { user, onPick } = setup()
    await user.click(input())
    await screen.findByText('Cola 1L')

    await user.type(input(), 'cola{Enter}')
    await waitFor(() => expect(search).toHaveBeenCalledWith({ organizationId: ORG, query: 'cola' }))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('con un único resultado, Enter lo elige', async () => {
    search.mockImplementation(async ({ query }) => ({ error: '', products: query === 'pan' ? [pan] : [cola] }))
    const { user, onPick } = setup()
    await user.click(input())
    await screen.findByText('Cola 1L')

    await user.type(input(), 'pan{Enter}')
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(pan))
  })

  it('sin resultados lo dice, con el texto buscado', async () => {
    search.mockImplementation(async ({ query }) => ({ error: '', products: query ? [] : [cola] }))
    const { user } = setup()
    await user.click(input())
    await screen.findByText('Cola 1L')

    await user.type(input(), 'zzz')
    expect(await screen.findByText('Sin resultados para "zzz"')).toBeTruthy()
  })

  it('si la búsqueda falla avisa para reintentar', async () => {
    search.mockResolvedValue({ error: 'No se pudo buscar productos', products: [] })
    const { user } = setup()
    await user.click(input())
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo buscar. Intenta de nuevo.')
  })

  it('Escape cierra la lista', async () => {
    const { user } = setup()
    await user.click(input())
    await screen.findByText('Cola 1L')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Cola 1L')).toBeNull())
  })
})
