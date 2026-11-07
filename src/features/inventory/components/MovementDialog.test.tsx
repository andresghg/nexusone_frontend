// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerMovementAction } from '../action/stock-action'
import type { ProductRow } from '../types/inventory'
import { MovementDialog } from './MovementDialog'

vi.mock('../action/stock-action', () => ({ registerMovementAction: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const ORG = '11111111-1111-4111-8111-111111111111'
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222'

const product: ProductRow = {
  id: PRODUCT_ID, sku: 'COLA', barcode: null, name: 'Cola 1L', description: null, unit: 'un',
  price: 1500, cost: 900, minStock: 2, trackStock: true, active: true,
  categoryId: null, categoryName: null, stock: 10, createdAt: '2026-11-01T00:00:00.000Z',
}

const action = vi.mocked(registerMovementAction)
const ok = { error: '', success: 'Entrada registrada', stock: 15 } as const

const setup = () => {
  const onOpenChange = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<MovementDialog open onOpenChange={onOpenChange} organizationId={ORG} product={product} />)
  return { user, onOpenChange }
}

const quantity = () => screen.getByRole('spinbutton') as HTMLInputElement

beforeEach(() => {
  action.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('MovementDialog · contenido', () => {
  it('muestra el producto, el stock actual y "Entrada" seleccionada', () => {
    setup()
    expect(screen.getByText('Cola 1L · COLA')).toBeTruthy()
    expect(screen.getByText('Stock actual')).toBeTruthy()
    expect(screen.getByText('10 un')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Entrada' }).getAttribute('aria-checked')).toBe('true')
  })

  it('el campo de cantidad cambia de significado según el tipo', async () => {
    const { user } = setup()
    expect(screen.getByLabelText('Cantidad que entra')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: 'Salida' }))
    expect(screen.getByLabelText('Cantidad que sale')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: 'Ajuste' }))
    expect(screen.getByLabelText('Stock real contado')).toBeTruthy()
  })

  it('no permite quedarse sin tipo al volver a pulsar el seleccionado', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Entrada' }))
    expect(screen.getByRole('radio', { name: 'Entrada' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('MovementDialog · vista previa (la misma regla del servidor)', () => {
  it('una entrada muestra cómo quedará el stock', async () => {
    const { user } = setup()
    await user.type(quantity(), '5')
    expect(screen.getByText('Quedará en')).toBeTruthy()
    expect(screen.getByText(/15 un/)).toBeTruthy()
    expect(screen.getByText('(+5)')).toBeTruthy()
  })

  it('una salida mayor al stock avisa y bloquea el envío', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Salida' }))
    await user.type(quantity(), '11')

    expect(screen.getByRole('alert').textContent).toBe('Stock insuficiente (disponible: 10)')
    expect((screen.getByRole('button', { name: 'Registrar salida' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('una salida que deja el stock en cero es válida', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Salida' }))
    await user.type(quantity(), '10')
    expect(screen.getByText('Quedará en').parentElement?.textContent).toContain('0 un (-10)')
    expect((screen.getByRole('button', { name: 'Registrar salida' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('un ajuste igual al stock actual avisa que no hay nada que ajustar', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Ajuste' }))
    await user.type(quantity(), '10')
    expect(screen.getByRole('alert').textContent).toBe('El stock ya coincide con el conteo')
  })

  it('un ajuste muestra la diferencia con el conteo', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Ajuste' }))
    await user.type(quantity(), '7')
    expect(screen.getByText('(-3)')).toBeTruthy()
  })

  it('sin cantidad no muestra resultado', () => {
    setup()
    expect(screen.queryByText('Quedará en')).toBeNull()
  })
})

describe('MovementDialog · envío', () => {
  it('envía empresa, producto, tipo, cantidad y motivo recortado; luego avisa y cierra', async () => {
    action.mockResolvedValue(ok)
    const { user, onOpenChange } = setup()

    await user.type(quantity(), '5')
    await user.type(screen.getByLabelText(/Motivo/), '  compra  ')
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(action).toHaveBeenCalledWith({
      organizationId: ORG, productId: PRODUCT_ID, type: 'in', quantity: 5, reason: 'compra',
    })
    expect(toast.success).toHaveBeenCalledWith('Entrada registrada. Stock: 15 un')
  })

  it('sin cantidad no envía y marca el error en el campo', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }))

    expect(action).not.toHaveBeenCalled()
    expect(screen.getByText('La cantidad: ingresa un número')).toBeTruthy()
  })

  it('un ajuste exige motivo: sin él no envía; con él, sí', async () => {
    action.mockResolvedValue({ error: '', success: 'Ajuste registrado', stock: 7 })
    const { user } = setup()

    await user.click(screen.getByRole('radio', { name: 'Ajuste' }))
    await user.type(quantity(), '7')
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }))
    expect(action).not.toHaveBeenCalled()
    expect(screen.getByText('Indica el motivo del ajuste')).toBeTruthy()

    await user.type(screen.getByLabelText(/Motivo/), 'Conteo mensual')
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        organizationId: ORG, productId: PRODUCT_ID, type: 'adjustment', quantity: 7, reason: 'Conteo mensual',
      }),
    )
  })

  it('si el servidor rechaza, avisa y NO cierra el diálogo', async () => {
    action.mockResolvedValue({ error: 'Stock insuficiente (disponible: 3)', success: '', stock: null })
    const { user, onOpenChange } = setup()

    await user.click(screen.getByRole('radio', { name: 'Salida' }))
    await user.type(quantity(), '4')
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Stock insuficiente (disponible: 3)'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('"Cancelar" cierra sin enviar nada', async () => {
    const { user, onOpenChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(action).not.toHaveBeenCalled()
  })

  it('con decimales envía el número exacto', async () => {
    action.mockResolvedValue({ error: '', success: 'Entrada registrada', stock: 10.5 })
    const { user } = setup()
    await user.type(quantity(), '0.5')
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ quantity: 0.5 })))
  })
})
