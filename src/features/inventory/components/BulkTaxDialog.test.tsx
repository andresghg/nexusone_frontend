// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { DEFAULT_DISPLAY_FORMAT, type DisplayFormat } from '@/features/billing/types/billing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setProductsTaxRateAction } from '../action/product-action'
import type { CategoryRow } from '../types/inventory'
import type { InventoryQuery } from '../utils/inventoryParams'
import { BulkTaxDialog } from './BulkTaxDialog'

vi.mock('../action/product-action', () => ({ setProductsTaxRateAction: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const ORG = '11111111-1111-4111-8111-111111111111'
const CAT = '22222222-2222-4222-8222-222222222222'
const action = vi.mocked(setProductsTaxRateAction)
const categories: CategoryRow[] = [{ id: CAT, name: 'Libros', productCount: 12 }]
const base: InventoryQuery = { q: '', category: '', status: 'active', low: false, page: 1 }

const setup = (over: { query?: Partial<InventoryQuery>; total?: number; display?: DisplayFormat } = {}) => {
  const onOpenChange = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0, delay: null })
  render(
    <BulkTaxDialog
      open
      onOpenChange={onOpenChange}
      organizationId={ORG}
      query={{ ...base, ...over.query }}
      total={over.total ?? 12}
      categories={categories}
      display={over.display ?? DEFAULT_DISPLAY_FORMAT}
    />,
  )
  return { user, onOpenChange }
}
const radio = (name: string) => screen.getByRole('radio', { name })
const apply = () => screen.getAllByRole('button').find((b) => /^(Dejar|Aplicar)/.test(b.textContent ?? '')) as HTMLButtonElement
const rate = () => screen.getByLabelText('Tasa de impuesto en %') as HTMLInputElement

beforeEach(() => {
  action.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('BulkTaxDialog · contenido', () => {
  it('explica a cuántos productos se aplica y con qué filtros', () => {
    setup({ query: { q: 'pan', category: CAT, status: 'all', low: true } })
    expect(screen.getByText(/Se aplica a los 12 productos de la lista que estás viendo/)).toBeTruthy()
    const chips = within(screen.getByRole('list', { name: 'Filtros de la lista' })).getAllByRole('listitem')
    expect(chips.map((c) => c.textContent)).toEqual(['Búsqueda: «pan»', 'Categoría: Libros', 'Estado: Todos', 'Solo stock bajo'])
  })

  it('singular cuando es un solo producto', () => {
    setup({ total: 1 })
    expect(screen.getByText(/Se aplica a los 1 producto de la lista/)).toBeTruthy()
  })

  it('no trae ninguna opción elegida: un cambio masivo es una decisión explícita', () => {
    setup()
    for (const name of ['Exento (0 %)', 'Tasa de la empresa', 'Otra tasa']) {
      expect(radio(name).getAttribute('aria-checked')).toBe('false')
    }
    expect(apply().disabled).toBe(true)
    expect(apply().textContent).toBe('Aplicar')
  })

  it('avisa que lo ya emitido no cambia', () => {
    setup()
    expect(screen.getByText(/Los documentos ya emitidos no cambian/)).toBeTruthy()
  })
})

describe('BulkTaxDialog · elegir la tasa', () => {
  it('el botón dice el efecto y el total', async () => {
    const { user } = setup()
    await user.click(radio('Exento (0 %)'))
    expect(apply().textContent).toBe('Dejar 12 productos exentos')
    expect(apply().disabled).toBe(false)
    await user.click(radio('Tasa de la empresa'))
    expect(apply().textContent).toBe('Aplicar la tasa de la empresa a 12 productos')
  })

  it('"Otra tasa" pide el valor y lo valida', async () => {
    const { user } = setup()
    expect(screen.queryByLabelText('Tasa de impuesto en %')).toBeNull()
    await user.click(radio('Otra tasa'))
    expect(apply().disabled).toBe(true) // todavía sin valor
    expect(screen.queryByRole('alert')).toBeNull() // sin gritar antes de escribir

    await user.type(rate(), '101')
    expect(screen.getByRole('alert').textContent).toBe('Debe ser un número entre 0 y 100, con máximo 2 decimales')
    expect(rate().getAttribute('aria-invalid')).toBe('true')
    expect(apply().disabled).toBe(true)

    await user.clear(rate())
    await user.type(rate(), '10,5')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(apply().textContent).toBe('Aplicar 10,5 % a 12 productos')
    expect(apply().disabled).toBe(false)
  })

  it('sin productos en la lista no se puede aplicar', async () => {
    const { user } = setup({ total: 0 })
    await user.click(radio('Exento (0 %)'))
    expect(apply().disabled).toBe(true)
  })

  it('el máximo se escribe con el formato numérico de la empresa', async () => {
    const { user } = setup({ total: 5001, display: { ...DEFAULT_DISPLAY_FORMAT, locale: 'en-US' } })
    await user.click(radio('Exento (0 %)'))
    expect(screen.getByRole('alert').textContent).toContain('(máximo 5,000)')
  })

  it('con más de 5.000 productos pide filtrar y no deja aplicar', async () => {
    const { user } = setup({ total: 5001 })
    await user.click(radio('Exento (0 %)'))
    expect(screen.getByRole('alert').textContent).toContain('demasiados productos')
    expect(apply().disabled).toBe(true)
  })
})

describe('BulkTaxDialog · aplicar', () => {
  it('manda los filtros de la lista, la tasa y el total confirmado, y cierra', async () => {
    action.mockResolvedValue({ error: '', success: 'Impuesto actualizado: 12 productos quedaron exentos' })
    const { user, onOpenChange } = setup({ query: { q: 'pan', category: CAT, status: 'all', low: true } })
    await user.click(radio('Exento (0 %)'))
    await user.click(apply())

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(action).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledWith({
      organizationId: ORG,
      filters: { search: 'pan', categoryId: CAT, status: 'all', lowStock: true },
      taxRate: '0',
      expectedCount: 12,
    })
    expect(toast.success).toHaveBeenCalledWith('Impuesto actualizado: 12 productos quedaron exentos')
  })

  it('"tasa de la empresa" manda vacío y "otra tasa" manda lo escrito', async () => {
    action.mockResolvedValue({ error: '', success: 'ok' })
    const { user } = setup()
    await user.click(radio('Tasa de la empresa'))
    await user.click(apply())
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0][0].taxRate).toBe('')

    await user.click(radio('Otra tasa'))
    await user.type(rate(), '10,5')
    await user.click(apply())
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
    expect(action.mock.calls[1][0].taxRate).toBe('10,5')
  })

  it('sin filtros de más: la lista por defecto son los activos', async () => {
    action.mockResolvedValue({ error: '', success: 'ok' })
    const { user } = setup()
    await user.click(radio('Exento (0 %)'))
    await user.click(apply())
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action.mock.calls[0][0].filters).toEqual({ search: undefined, categoryId: undefined, status: 'active', lowStock: undefined })
  })

  it('si el servidor rechaza (por ejemplo, la lista cambió), avisa y deja el diálogo abierto para revisar', async () => {
    action.mockResolvedValue({ error: 'La lista cambió: ahora tiene 13 productos y habías confirmado 12. Revísala y vuelve a intentarlo', success: '' })
    const { user, onOpenChange } = setup()
    await user.click(radio('Exento (0 %)'))
    await user.click(apply())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('La lista cambió')))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(apply().disabled).toBe(false)
  })

  it('si la petición falla del todo, mensaje genérico', async () => {
    action.mockRejectedValue(new Error('network'))
    const { user, onOpenChange } = setup()
    await user.click(radio('Exento (0 %)'))
    await user.click(apply())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo actualizar el impuesto de los productos'))
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('mientras se aplica, el botón se deshabilita: un doble clic no manda dos cambios', async () => {
    let finish: (value: { error: string; success: string }) => void = () => {}
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { user } = setup()
    await user.click(radio('Exento (0 %)'))
    await user.click(apply())
    await user.click(apply())
    expect(action).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(true)
    finish({ error: '', success: 'ok' })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })

  it('cancelar cierra sin cambiar nada', async () => {
    const { user, onOpenChange } = setup()
    await user.click(radio('Exento (0 %)'))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(action).not.toHaveBeenCalled()
  })
})
