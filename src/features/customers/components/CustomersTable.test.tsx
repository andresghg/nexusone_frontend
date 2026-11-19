// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCustomerActiveAction } from '../action/customer-action'
import type { CustomerRow } from '../types/customers'
import type { CustomersQuery } from '../utils/customerParams'
import { CustomersTable } from './CustomersTable'

vi.mock('../action/customer-action', () => ({ setCustomerActiveAction: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/clientes',
}))

const ORG = '11111111-1111-4111-8111-111111111111'
const noFilters: CustomersQuery = { q: '', status: 'active', page: 1 }

const customer = (over: Partial<CustomerRow> = {}): CustomerRow => ({
  id: 'c-1', name: 'Ana Pérez', taxId: '76123456-7', email: 'ana@x.cl', phone: '+56 9 1234 5678',
  address: null, notes: null, active: true, createdAt: '2026-11-01T00:00:00.000Z', ...over,
})

const setActive = vi.mocked(setCustomerActiveAction)

const setup = (
  customers: CustomerRow[],
  { canWrite = true, query = noFilters }: { canWrite?: boolean; query?: CustomersQuery } = {},
) => {
  const handlers = { onCreate: vi.fn(), onEdit: vi.fn() }
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<CustomersTable organizationId={ORG} customers={customers} query={query} canWrite={canWrite} {...handlers} />)
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

describe('CustomersTable · contenido', () => {
  it('muestra nombre, RUT, correo y teléfono', () => {
    setup([customer()])
    expect(screen.getByText('Ana Pérez')).toBeTruthy()
    expect(screen.getByText('76123456-7')).toBeTruthy()
    expect(screen.getByText('ana@x.cl')).toBeTruthy()
    expect(screen.getByText('+56 9 1234 5678')).toBeTruthy()
  })

  it('sin RUT ni contacto lo dice con claridad', () => {
    setup([customer({ taxId: null, email: null, phone: null })])
    expect(screen.getByText('Sin RUT')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('un cliente solo con teléfono muestra solo el teléfono', () => {
    setup([customer({ email: null })])
    expect(screen.getByText('+56 9 1234 5678')).toBeTruthy()
    expect(screen.queryByText('ana@x.cl')).toBeNull()
  })

  it('los clientes archivados se distinguen: insignia y fila atenuada', () => {
    setup([customer({ active: false })])
    expect(screen.getByText('Archivado')).toBeTruthy()
    expect(screen.getByRole('row', { name: /Ana Pérez/ }).className).toContain('opacity-60')
  })
})

describe('CustomersTable · acciones según permisos', () => {
  it('quien solo puede leer no ve menú de acciones', () => {
    setup([customer()], { canWrite: false })
    expect(screen.queryByRole('button', { name: 'Acciones de Ana Pérez' })).toBeNull()
  })

  it('quien puede escribir edita o archiva', async () => {
    const { user } = setup([customer()])
    await openMenu(user, 'Ana Pérez')
    expect(menuLabels()).toEqual(['Editar', 'Archivar'])
  })

  it('un cliente archivado ofrece restaurar en lugar de archivar', async () => {
    const { user } = setup([customer({ active: false })])
    await openMenu(user, 'Ana Pérez')
    expect(menuLabels()).toEqual(['Editar', 'Restaurar'])
  })

  it('editar avisa con el cliente de su fila', async () => {
    const target = customer()
    const { user, onEdit } = setup([target, customer({ id: 'c-2', name: 'Luis Soto' })])
    await openMenu(user, 'Ana Pérez')
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    expect(onEdit).toHaveBeenCalledWith(target)
  })
})

describe('CustomersTable · archivar y restaurar', () => {
  it('archivar pide confirmación y no hace nada si se cancela', async () => {
    const { user } = setup([customer()])
    await openMenu(user, 'Ana Pérez')
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('¿Archivar a Ana Pérez?')).toBeTruthy()
    expect(within(dialog).getByText(/Sus facturas anteriores se conservan/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(setActive).not.toHaveBeenCalled()
  })

  it('al confirmar archiva al cliente y avisa', async () => {
    setActive.mockResolvedValue({ error: '', success: 'Cliente archivado' })
    const { user } = setup([customer()])
    await openMenu(user, 'Ana Pérez')
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar' }))
    await user.click(await screen.findByRole('button', { name: 'Archivar', hidden: false }))

    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith({ organizationId: ORG, customerId: 'c-1', active: false }),
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cliente archivado'))
  })

  it('restaurar es directo, sin confirmación', async () => {
    setActive.mockResolvedValue({ error: '', success: 'Cliente restaurado' })
    const { user } = setup([customer({ active: false })])
    await openMenu(user, 'Ana Pérez')
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurar' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith({ organizationId: ORG, customerId: 'c-1', active: true }),
    )
  })

  it('muestra el error del servidor, y también si la petición falla del todo', async () => {
    const { user } = setup([customer({ active: false })])

    setActive.mockResolvedValueOnce({ error: 'El cliente no existe', success: '' })
    await openMenu(user, 'Ana Pérez')
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El cliente no existe'))

    setActive.mockRejectedValueOnce(new Error('red caída'))
    await openMenu(user, 'Ana Pérez')
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo cambiar el estado del cliente'))
  })
})

describe('CustomersTable · estados vacíos', () => {
  it('sin clientes y con permiso invita a crear el primero', async () => {
    const { user, onCreate } = setup([])
    expect(screen.getByText('Aún no tienes clientes')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('sin clientes y sin permiso no ofrece crear', () => {
    setup([], { canWrite: false })
    expect(screen.getByText('Cuando se registren clientes, aparecerán aquí.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nuevo cliente' })).toBeNull()
  })

  it('con filtros activos dice "Sin resultados" y permite limpiar', () => {
    setup([], { query: { ...noFilters, q: 'zzz' } })
    expect(screen.getByText('Sin resultados')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy()
  })
})
