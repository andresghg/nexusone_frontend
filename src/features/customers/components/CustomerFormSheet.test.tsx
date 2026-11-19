// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCustomerAction, updateCustomerAction } from '../action/customer-action'
import type { CustomerRow } from '../types/customers'
import { CustomerFormSheet } from './CustomerFormSheet'

vi.mock('../action/customer-action', () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const ORG = '11111111-1111-4111-8111-111111111111'
const existing: CustomerRow = {
  id: '22222222-2222-4222-8222-222222222222', name: 'Ana Pérez', taxId: '76123456-7',
  email: 'ana@x.cl', phone: null, address: 'Av. Siempre Viva 742', notes: null,
  active: true, createdAt: '2026-11-01T00:00:00.000Z',
}

const create = vi.mocked(createCustomerAction)
const update = vi.mocked(updateCustomerAction)

const setup = (customer: CustomerRow | null = null) => {
  const onOpenChange = vi.fn()
  const onCreated = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<CustomerFormSheet open onOpenChange={onOpenChange} onCreated={onCreated} organizationId={ORG} customer={customer} />)
  return { user, onOpenChange, onCreated }
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

describe('CustomerFormSheet · crear', () => {
  it('muestra un formulario vacío con el aviso de que solo el nombre es obligatorio', () => {
    setup()
    expect(screen.getByText('Nuevo cliente', { selector: '[data-slot="sheet-title"]' })).toBeTruthy()
    expect(screen.getByText(/Solo el nombre es obligatorio/)).toBeTruthy()
    expect(field('Nombre o razón social').value).toBe('')
    expect(screen.getByRole('button', { name: 'Crear cliente' })).toBeTruthy()
  })

  it('sin nombre muestra el error y no envía', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    const message = await screen.findByText('El nombre es obligatorio')
    expect(message.getAttribute('role')).toBe('alert')
    expect(field('Nombre o razón social').getAttribute('aria-invalid')).toBe('true')
    expect(create).not.toHaveBeenCalled()
  })

  it('crea con solo el nombre, avisa y cierra', async () => {
    create.mockResolvedValue({ error: '', success: 'Cliente creado' })
    const { user, onOpenChange } = setup()

    await fill(user, 'Nombre o razón social', 'Comercial Sur')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(create).toHaveBeenCalledWith({
      organizationId: ORG,
      name: 'Comercial Sur',
      taxId: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    })
    expect(toast.success).toHaveBeenCalledWith('Cliente creado')
  })

  it('al crear avisa con el cliente creado, para poder elegirlo de inmediato en otro formulario', async () => {
    const created = { id: 'c-9', name: 'Comercial Sur', taxId: null, email: null, address: null }
    create.mockResolvedValue({ error: '', success: 'Cliente creado', customer: created })
    const { user, onCreated } = setup()

    await fill(user, 'Nombre o razón social', 'Comercial Sur')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  })

  it('valida correo y RUT antes de enviar', async () => {
    const { user } = setup()
    await fill(user, 'Nombre o razón social', 'Ana')
    await fill(user, 'Correo', 'ana@')
    await fill(user, 'RUT o ID tributario', '76/123')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(await screen.findByText('Correo inválido')).toBeTruthy()
    expect(screen.getByText('Usa solo letras, números, puntos y guiones')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('un RUT repetido se marca en su campo y el formulario sigue abierto', async () => {
    create.mockResolvedValue({
      error: 'Ya existe un cliente con ese RUT o identificación tributaria',
      success: '',
    })
    const { user, onOpenChange } = setup()
    await fill(user, 'Nombre o razón social', 'Ana')
    await fill(user, 'RUT o ID tributario', '76.123.456-7')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    expect(await screen.findByText('Ya existe un cliente con ese RUT o identificación tributaria')).toBeTruthy()
    expect(field('RUT o ID tributario').getAttribute('aria-invalid')).toBe('true')
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('otro error del servidor se avisa y no cierra', async () => {
    create.mockResolvedValue({ error: 'No tienes permisos para modificar clientes', success: '' })
    const { user, onOpenChange } = setup()
    await fill(user, 'Nombre o razón social', 'Ana')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No tienes permisos para modificar clientes'))
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('cancelar cierra sin enviar', async () => {
    const { user, onOpenChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('CustomerFormSheet · editar', () => {
  it('carga los datos del cliente (los vacíos como texto vacío) y recuerda que las facturas emitidas no cambian', () => {
    setup(existing)
    expect(screen.getByText('Editar cliente', { selector: '[data-slot="sheet-title"]' })).toBeTruthy()
    expect(screen.getByText(/no alteran las facturas ya emitidas/)).toBeTruthy()
    expect(field('Nombre o razón social').value).toBe('Ana Pérez')
    expect(field('RUT o ID tributario').value).toBe('76123456-7')
    expect(field('Correo').value).toBe('ana@x.cl')
    expect(field('Teléfono').value).toBe('')
    expect(field('Dirección').value).toBe('Av. Siempre Viva 742')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy()
  })

  it('guarda con el id del cliente y cierra', async () => {
    update.mockResolvedValue({ error: '', success: 'Cliente actualizado' })
    const { user, onOpenChange, onCreated } = setup(existing)

    await fill(user, 'Teléfono', '912345678')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(update).toHaveBeenCalledWith({
      organizationId: ORG,
      customerId: existing.id,
      name: 'Ana Pérez',
      taxId: '76123456-7',
      email: 'ana@x.cl',
      phone: '912345678',
      address: 'Av. Siempre Viva 742',
      notes: '',
    })
    expect(create).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled() // editar no es crear
    expect(toast.success).toHaveBeenCalledWith('Cliente actualizado')
  })
})
