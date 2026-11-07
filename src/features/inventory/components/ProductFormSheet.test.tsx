// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProductAction, updateProductAction } from '../action/product-action'
import type { CategoryRow, ProductRow } from '../types/inventory'
import { ProductFormSheet } from './ProductFormSheet'

vi.mock('../action/product-action', () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const ORG = '11111111-1111-4111-8111-111111111111'
const CAT = '33333333-3333-4333-8333-333333333333'
const categories: CategoryRow[] = [{ id: CAT, name: 'Bebidas', productCount: 2 }]

const existing: ProductRow = {
  id: '22222222-2222-4222-8222-222222222222', sku: 'COLA', barcode: '7801', name: 'Cola 1L',
  description: 'Botella', unit: 'lt', price: 1500, cost: 900, minStock: 2, trackStock: true,
  active: true, categoryId: CAT, categoryName: 'Bebidas', stock: 10, createdAt: '2026-11-01T00:00:00.000Z',
}

const create = vi.mocked(createProductAction)
const update = vi.mocked(updateProductAction)

const setup = (product: ProductRow | null = null) => {
  const onOpenChange = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <ProductFormSheet open onOpenChange={onOpenChange} organizationId={ORG} categories={categories} product={product} />,
  )
  return { user, onOpenChange }
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const fill = async (user: ReturnType<typeof userEvent.setup>, label: string, value: string) => {
  await user.clear(field(label))
  await user.type(field(label), value)
}

beforeEach(() => {
  create.mockReset()
  update.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('ProductFormSheet · crear', () => {
  it('muestra los campos de un producto nuevo, incluido el stock inicial', () => {
    setup()
    expect(screen.getByText('Nuevo producto', { selector: '[data-slot="sheet-title"]' })).toBeTruthy()
    expect(field('SKU').value).toBe('')
    expect(field('Stock inicial').value).toBe('0')
    expect(screen.getByRole('button', { name: 'Crear producto' })).toBeTruthy()
  })

  it('con campos obligatorios vacíos muestra los errores y no envía', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))

    expect(await screen.findByText('El SKU es obligatorio')).toBeTruthy()
    expect(screen.getByText('El nombre es obligatorio')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('envía los datos con los tipos correctos (números como números) y cierra', async () => {
    create.mockResolvedValue({ error: '', success: 'Producto creado' })
    const { user, onOpenChange } = setup()

    await fill(user, 'SKU', 'cola-1l')
    await fill(user, 'Nombre', 'Cola 1L')
    await fill(user, 'Precio de venta', '1500')
    await fill(user, 'Costo', '900.5')
    await fill(user, 'Stock mínimo', '2')
    await fill(user, 'Stock inicial', '10')
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(create).toHaveBeenCalledWith({
      organizationId: ORG,
      sku: 'cola-1l',
      barcode: '',
      name: 'Cola 1L',
      description: '',
      unit: 'un',
      categoryId: '',
      price: 1500,
      cost: 900.5,
      minStock: 2,
      trackStock: true,
      active: true,
      initialStock: 10,
    })
    expect(toast.success).toHaveBeenCalledWith('Producto creado')
  })

  it('rechaza un precio negativo y un stock inicial con más de 3 decimales', async () => {
    const { user } = setup()
    await fill(user, 'SKU', 'A')
    await fill(user, 'Nombre', 'B')
    await fill(user, 'Precio de venta', '-5')
    await fill(user, 'Stock inicial', '1.2345')
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))

    expect(await screen.findByText('El precio no puede ser negativo')).toBeTruthy()
    expect(screen.getByText('El stock inicial: máximo 3 decimales')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('un SKU repetido se marca en el campo SKU, sin cerrar ni mostrar aviso', async () => {
    create.mockResolvedValue({ error: 'Ya existe un producto con ese SKU', success: '' })
    const { user, onOpenChange } = setup()

    await fill(user, 'SKU', 'COLA')
    await fill(user, 'Nombre', 'Cola')
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))

    expect(await screen.findByText('Ya existe un producto con ese SKU')).toBeTruthy()
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('un código de barras repetido se marca en su campo', async () => {
    create.mockResolvedValue({ error: 'Ya existe un producto con ese código de barras', success: '' })
    const { user } = setup()
    await fill(user, 'SKU', 'X')
    await fill(user, 'Nombre', 'Y')
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    expect(await screen.findByText('Ya existe un producto con ese código de barras')).toBeTruthy()
  })

  it('cualquier otro error del servidor sale como aviso y el formulario sigue abierto', async () => {
    create.mockResolvedValue({ error: 'No tienes permisos para modificar el inventario', success: '' })
    const { user, onOpenChange } = setup()
    await fill(user, 'SKU', 'X')
    await fill(user, 'Nombre', 'Y')
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No tienes permisos para modificar el inventario'))
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('desactivar "Controlar stock" oculta el stock mínimo y el inicial', async () => {
    const { user } = setup()
    expect(screen.getByLabelText('Stock mínimo')).toBeTruthy()

    await user.click(screen.getByRole('switch', { name: 'Controlar stock' }))

    expect(screen.queryByLabelText('Stock mínimo')).toBeNull()
    expect(screen.queryByLabelText('Stock inicial')).toBeNull()
  })
})

describe('ProductFormSheet · editar', () => {
  it('precarga el producto y no ofrece stock inicial', () => {
    setup(existing)
    expect(screen.getByText('Editar producto', { selector: '[data-slot="sheet-title"]' })).toBeTruthy()
    expect(field('SKU').value).toBe('COLA')
    expect(field('Código de barras').value).toBe('7801')
    expect(field('Nombre').value).toBe('Cola 1L')
    expect(field('Precio de venta').value).toBe('1500')
    expect(screen.queryByLabelText('Stock inicial')).toBeNull()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy()
  })

  it('guarda con el id del producto y la empresa', async () => {
    update.mockResolvedValue({ error: '', success: 'Producto actualizado' })
    const { user, onOpenChange } = setup(existing)

    await fill(user, 'Precio de venta', '1800')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        productId: existing.id,
        sku: 'COLA',
        unit: 'lt',
        categoryId: CAT,
        price: 1800,
      }),
    )
    expect(create).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Producto actualizado')
  })
})
