// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { DEFAULT_DISPLAY_FORMAT, type DisplayFormat } from '@/features/billing/types/billing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setProductActiveAction } from '../action/product-action'
import type { ProductRow } from '../types/inventory'
import type { InventoryQuery } from '../utils/inventoryParams'
import { ProductsTable } from './ProductsTable'

vi.mock('../action/product-action', () => ({ setProductActiveAction: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/inventario',
}))

const ORG = '11111111-1111-4111-8111-111111111111'
const noFilters: InventoryQuery = { q: '', category: '', status: 'active', low: false, page: 1 }

const product = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: 'p-1', sku: 'COLA', barcode: null, name: 'Cola 1L', description: null, unit: 'un',
  price: 1500, cost: 900, taxRate: null, minStock: 2, trackStock: true, active: true,
  categoryId: 'c-1', categoryName: 'Bebidas', stock: 10, createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
})

const setActive = vi.mocked(setProductActiveAction)

const setup = (
  products: ProductRow[],
  {
    canWrite = true,
    query = noFilters,
    display = DEFAULT_DISPLAY_FORMAT,
  }: { canWrite?: boolean; query?: InventoryQuery; display?: DisplayFormat } = {},
) => {
  const handlers = { onCreate: vi.fn(), onEdit: vi.fn(), onMovement: vi.fn(), onHistory: vi.fn() }
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<ProductsTable organizationId={ORG} products={products} query={query} canWrite={canWrite} display={display} {...handlers} />)
  return { user, ...handlers }
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole('button', { name: `Acciones de ${name}` }))

const menuLabels = () => screen.getAllByRole('menuitem').map((item) => item.textContent)

beforeEach(() => {
  setActive.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('ProductsTable · contenido', () => {
  it('muestra nombre, SKU y categoría, precio y stock con su unidad', () => {
    setup([product()])
    expect(screen.getByText('Cola 1L')).toBeTruthy()
    expect(screen.getByText('COLA · Bebidas')).toBeTruthy()
    expect(screen.getByRole('cell', { name: /\$\s?1\.500/ })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '10 un' })).toBeTruthy()
  })

  it('marca el estado de stock: agotado, bajo, normal y sin control', () => {
    setup([
      product({ id: '1', name: 'Agotado', stock: 0 }),
      product({ id: '2', name: 'Bajo', stock: 2 }),
      product({ id: '3', name: 'Normal', stock: 50 }),
      product({ id: '4', name: 'Servicio', trackStock: false }),
    ])
    expect(screen.getByText('Agotado', { selector: '[data-slot="badge"]' })).toBeTruthy()
    expect(screen.getByText('Bajo', { selector: '[data-slot="badge"]' })).toBeTruthy()
    expect(screen.getAllByText('Agotado')).toHaveLength(2) // el nombre del producto y la insignia
    expect(screen.getByText('Sin control')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /Normal/ })).queryByText('Bajo')).toBeNull()
  })

  it('los productos archivados se distinguen: insignia y fila atenuada', () => {
    setup([product({ active: false })])
    expect(screen.getByText('Archivado')).toBeTruthy()
    expect(screen.getByRole('row', { name: /Cola 1L/ }).className).toContain('opacity-60')
  })
})

describe('ProductsTable · acciones según permisos', () => {
  it('quien solo puede leer ve únicamente "Ver historial"', async () => {
    const { user } = setup([product()], { canWrite: false })
    await openMenu(user, 'Cola 1L')
    expect(menuLabels()).toEqual(['Ver historial'])
  })

  it('quien solo puede leer no ve menú en productos sin control de stock', () => {
    setup([product({ trackStock: false })], { canWrite: false })
    expect(screen.queryByRole('button', { name: 'Acciones de Cola 1L' })).toBeNull()
  })

  it('quien puede escribir ve movimiento, historial, editar y archivar', async () => {
    const { user } = setup([product()])
    await openMenu(user, 'Cola 1L')
    expect(menuLabels()).toEqual(['Registrar movimiento', 'Ver historial', 'Editar', 'Archivar'])
  })

  it('un producto archivado ofrece restaurar y no movimientos', async () => {
    const { user } = setup([product({ active: false })])
    await openMenu(user, 'Cola 1L')
    expect(menuLabels()).toEqual(['Ver historial', 'Editar', 'Restaurar'])
  })

  it('un producto sin control de stock solo se edita o archiva', async () => {
    const { user } = setup([product({ trackStock: false })])
    await openMenu(user, 'Cola 1L')
    expect(menuLabels()).toEqual(['Editar', 'Archivar'])
  })

  it('cada acción avisa con el producto de su fila', async () => {
    const target = product()
    const { user, onEdit, onMovement, onHistory } = setup([target, product({ id: 'p-2', name: 'Pan' })])

    await openMenu(user, 'Cola 1L')
    await user.click(await screen.findByRole('menuitem', { name: 'Registrar movimiento' }))
    expect(onMovement).toHaveBeenCalledWith(target)

    await openMenu(user, 'Cola 1L')
    await user.click(await screen.findByRole('menuitem', { name: 'Ver historial' }))
    expect(onHistory).toHaveBeenCalledWith(target)

    await openMenu(user, 'Cola 1L')
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    expect(onEdit).toHaveBeenCalledWith(target)
  })
})

describe('ProductsTable · archivar y restaurar', () => {
  it('archivar pide confirmación y no hace nada si se cancela', async () => {
    const { user } = setup([product()])
    await openMenu(user, 'Cola 1L')
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('¿Archivar Cola 1L?')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(setActive).not.toHaveBeenCalled()
  })

  it('al confirmar archiva el producto y avisa', async () => {
    setActive.mockResolvedValue({ error: '', success: 'Producto archivado' })
    const { user } = setup([product()])
    await openMenu(user, 'Cola 1L')
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar' }))
    await user.click(await screen.findByRole('button', { name: 'Archivar', hidden: false }))

    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith({ organizationId: ORG, productId: 'p-1', active: false }),
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Producto archivado'))
  })

  it('restaurar es directo, sin confirmación', async () => {
    setActive.mockResolvedValue({ error: '', success: 'Producto restaurado' })
    const { user } = setup([product({ active: false })])
    await openMenu(user, 'Cola 1L')
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurar' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith({ organizationId: ORG, productId: 'p-1', active: true }),
    )
  })

  it('muestra el error del servidor, y también si la petición falla del todo', async () => {
    const { user } = setup([product({ active: false })])

    setActive.mockResolvedValueOnce({ error: 'El producto no existe', success: '' })
    await openMenu(user, 'Cola 1L')
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El producto no existe'))

    setActive.mockRejectedValueOnce(new Error('red caída'))
    await openMenu(user, 'Cola 1L')
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo cambiar el estado del producto'))
  })
})

describe('ProductsTable · estados vacíos', () => {
  it('sin productos y con permiso invita a crear el primero', async () => {
    const { user, onCreate } = setup([])
    expect(screen.getByText('Aún no tienes productos')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Nuevo producto' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('sin productos y sin permiso no ofrece crear', () => {
    setup([], { canWrite: false })
    expect(screen.getByText('Cuando se registren productos, aparecerán aquí.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nuevo producto' })).toBeNull()
  })

  it('con filtros activos dice "Sin resultados" y permite limpiar', () => {
    setup([], { query: { ...noFilters, q: 'zzz' } })
    expect(screen.getByText('Sin resultados')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nuevo producto' })).toBeNull()
  })
})

describe('ProductsTable · formato de la empresa', () => {
  const usd: DisplayFormat = { currency: 'USD', currencyDecimals: 2, locale: 'en-US', timezone: 'America/New_York' }
  const eur: DisplayFormat = { currency: 'EUR', currencyDecimals: 2, locale: 'de-DE', timezone: 'Europe/Berlin' }
  const cell = (name: string, text: RegExp | string) => within(screen.getByRole('row', { name: new RegExp(name) })).getAllByText(text)

  it('el precio y el stock siguen la moneda y el idioma de la empresa', () => {
    setup([product({ price: 1234.5, stock: 1234.5 })], { display: usd })
    expect(cell('Cola 1L', '$1,234.50').length).toBeGreaterThan(0)
    expect(cell('Cola 1L', /1,234\.5/).length).toBeGreaterThan(0)
  })

  it('otro idioma, otro separador', () => {
    setup([product({ price: 1234.5, stock: 1234.5 })], { display: eur })
    expect(cell('Cola 1L', /1\.234,50\s?€/).length).toBeGreaterThan(0)
    expect(cell('Cola 1L', /1\.234,5/).length).toBeGreaterThan(0)
  })

  it('en pesos sin decimales no esconde los centavos de un precio', () => {
    setup([product({ price: 1500.5 })])
    expect(cell('Cola 1L', /\$\s?1\.500,50/).length).toBeGreaterThan(0)
  })

  it('al cambiar la configuración de la empresa la tabla se vuelve a dibujar con el formato nuevo', () => {
    const { rerender } = render(
      <ProductsTable organizationId={ORG} products={[product()]} query={noFilters} canWrite display={DEFAULT_DISPLAY_FORMAT}
        onCreate={vi.fn()} onEdit={vi.fn()} onMovement={vi.fn()} onHistory={vi.fn()} />,
    )
    expect(cell('Cola 1L', /\$\s?1\.500/).length).toBeGreaterThan(0)
    rerender(
      <ProductsTable organizationId={ORG} products={[product()]} query={noFilters} canWrite display={usd}
        onCreate={vi.fn()} onEdit={vi.fn()} onMovement={vi.fn()} onHistory={vi.fn()} />,
    )
    expect(cell('Cola 1L', '$1,500.00').length).toBeGreaterThan(0)
  })
})
