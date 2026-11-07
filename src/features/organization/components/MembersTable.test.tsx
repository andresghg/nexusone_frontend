// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changeMemberRoleAction, removeMemberAction } from '../action/member-action'
import type { MemberRow } from '../types/member'
import { MembersTable } from './MembersTable'

vi.mock('../action/member-action', () => ({
  changeMemberRoleAction: vi.fn(),
  removeMemberAction: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/usuarios',
}))

const ORG = '11111111-1111-4111-8111-111111111111'

const member = (over: Partial<MemberRow> & Pick<MemberRow, 'userId' | 'role'>): MemberRow => ({
  fullName: null, avatarUrl: null, email: null, joinedAt: '2026-10-20T12:00:00.000Z', ...over,
})

const owner = member({ userId: 'u-owner', role: 'owner', fullName: 'Olga Dueña', email: 'olga@acme.cl' })
const admin = member({ userId: 'u-admin', role: 'admin', fullName: 'Ana Pérez', email: 'ana@acme.cl' })
const staff = member({ userId: 'u-member', role: 'member', fullName: 'Marco Soto', email: 'marco@acme.cl' })

const changeRole = vi.mocked(changeMemberRoleAction)
const removeMember = vi.mocked(removeMemberAction)

const setup = (members: MemberRow[], currentUserId: string, currentRole: string) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<MembersTable organizationId={ORG} members={members} currentUserId={currentUserId} currentRole={currentRole} />)
  return user
}

const hasMenu = (name: string) => !!screen.queryByRole('button', { name: `Acciones de ${name}` })
const hasRoleSelect = (name: string) => !!screen.queryByRole('combobox', { name: `Rol de ${name}` })

beforeEach(() => {
  changeRole.mockReset()
  removeMember.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('MembersTable · contenido', () => {
  it('muestra a cada usuario con nombre, correo y fecha, y marca al usuario actual', () => {
    setup([owner, admin], 'u-owner', 'owner')
    expect(screen.getByRole('heading', { name: 'Usuarios y permisos' })).toBeTruthy()
    expect(screen.getByText('2 usuarios en tu empresa')).toBeTruthy()
    expect(screen.getByText('Olga Dueña (tú)')).toBeTruthy()
    expect(screen.getByText('ana@acme.cl')).toBeTruthy()
    expect(screen.getAllByRole('cell', { name: /20.*2026/ })).toHaveLength(2) // una fecha por usuario
  })

  it('el conteo usa singular y plural', () => {
    setup([owner], 'u-owner', 'owner')
    expect(screen.getByText('1 usuario en tu empresa')).toBeTruthy()
  })

  it('sin nombre muestra "Sin nombre" y las iniciales salen del correo', () => {
    setup([member({ userId: 'x', role: 'member', email: 'carla.diaz@acme.cl' })], 'u-owner', 'owner')
    expect(screen.getByText('Sin nombre')).toBeTruthy()
    expect(screen.getByText('CD')).toBeTruthy()
  })
})

describe('MembersTable · quién puede qué (mismas reglas del servidor)', () => {
  it('propietario: edita el rol y quita a admins y miembros, pero no toca al propietario', () => {
    setup([owner, admin, staff], 'u-owner', 'owner')

    expect(hasRoleSelect('Olga Dueña')).toBe(false)
    expect(screen.getByText('Propietario')).toBeTruthy()
    expect(hasMenu('Olga Dueña')).toBe(false)

    for (const name of ['Ana Pérez', 'Marco Soto']) {
      expect(hasRoleSelect(name)).toBe(true)
      expect(hasMenu(name)).toBe(true)
    }
  })

  it('administrador: no cambia roles y solo quita a miembros', () => {
    setup([owner, admin, staff], 'u-admin', 'admin')

    for (const name of ['Olga Dueña', 'Ana Pérez', 'Marco Soto']) expect(hasRoleSelect(name)).toBe(false)
    expect(hasMenu('Marco Soto')).toBe(true) // miembro
    expect(hasMenu('Ana Pérez')).toBe(false) // él mismo (otro admin tampoco se podría)
    expect(hasMenu('Olga Dueña')).toBe(false) // propietario
  })

  it('un administrador no puede quitar a otro administrador', () => {
    const otherAdmin = member({ userId: 'u-admin-2', role: 'admin', fullName: 'Beto Ruiz' })
    setup([owner, admin, otherAdmin], 'u-admin', 'admin')
    expect(hasMenu('Beto Ruiz')).toBe(false)
  })

  it('nadie puede quitarse a sí mismo', () => {
    setup([owner, admin, staff], 'u-member', 'owner') // aunque fuera propietario y apareciera como miembro
    expect(hasMenu('Marco Soto')).toBe(false)
  })

  it('un rol sin atribuciones no ve ningún control', () => {
    setup([owner, admin, staff], 'u-member', 'member')
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /^Acciones de/ })).toHaveLength(0)
  })
})

describe('MembersTable · cambiar rol', () => {
  const pickRole = async (user: ReturnType<typeof userEvent.setup>, name: string, option: string) => {
    await user.click(screen.getByRole('combobox', { name: `Rol de ${name}` }))
    await user.click(await screen.findByRole('option', { name: option }))
  }

  it('envía empresa, usuario y rol nuevo, y avisa', async () => {
    changeRole.mockResolvedValue({ error: '', success: 'Rol actualizado' })
    const user = setup([owner, staff], 'u-owner', 'owner')

    await pickRole(user, 'Marco Soto', 'Administrador')

    await waitFor(() =>
      expect(changeRole).toHaveBeenCalledWith({ organizationId: ORG, userId: 'u-member', role: 'admin' }),
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Rol actualizado'))
  })

  it('muestra el error del servidor y también si la petición falla del todo', async () => {
    const user = setup([owner, admin], 'u-owner', 'owner')

    changeRole.mockResolvedValueOnce({ error: 'Solo el propietario puede cambiar roles', success: '' })
    await pickRole(user, 'Ana Pérez', 'Miembro')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Solo el propietario puede cambiar roles'))

    changeRole.mockRejectedValueOnce(new Error('red caída'))
    await pickRole(user, 'Ana Pérez', 'Miembro')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo cambiar el rol'))
  })

  it('el selector queda deshabilitado solo mientras guarda', async () => {
    let finish: () => void = () => {}
    changeRole.mockReturnValue(new Promise((resolve) => { finish = () => resolve({ error: '', success: 'ok' }) }))
    const user = setup([owner, staff], 'u-owner', 'owner')

    await pickRole(user, 'Marco Soto', 'Administrador')
    const select = () => screen.getByRole('combobox', { name: 'Rol de Marco Soto' }) as HTMLButtonElement
    await waitFor(() => expect(select().disabled).toBe(true))

    finish()
    await waitFor(() => expect(select().disabled).toBe(false))
  })
})

describe('MembersTable · quitar usuario', () => {
  const openRemoveDialog = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole('button', { name: `Acciones de ${name}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Quitar de la empresa' }))
    return screen.findByRole('alertdialog')
  }

  it('pide confirmación con el nombre y no hace nada si se cancela', async () => {
    const user = setup([owner, staff], 'u-owner', 'owner')
    const dialog = await openRemoveDialog(user, 'Marco Soto')

    expect(within(dialog).getByText('¿Quitar a Marco Soto?')).toBeTruthy()
    expect(within(dialog).getByText('Perderá el acceso a la empresa de inmediato.')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(removeMember).not.toHaveBeenCalled()
  })

  it('al confirmar quita al usuario de ESA empresa y avisa', async () => {
    removeMember.mockResolvedValue({ error: '', success: 'Usuario quitado de la empresa' })
    const user = setup([owner, staff], 'u-owner', 'owner')
    const dialog = await openRemoveDialog(user, 'Marco Soto')
    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }))

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith({ organizationId: ORG, userId: 'u-member' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Usuario quitado de la empresa'))
  })

  it('muestra el error del servidor y también si la petición falla del todo', async () => {
    const user = setup([owner, staff], 'u-owner', 'owner')

    removeMember.mockResolvedValueOnce({ error: 'No puedes quitarte a ti mismo', success: '' })
    await user.click(within(await openRemoveDialog(user, 'Marco Soto')).getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No puedes quitarte a ti mismo'))

    removeMember.mockRejectedValueOnce(new Error('red caída'))
    await user.click(within(await openRemoveDialog(user, 'Marco Soto')).getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo quitar al usuario'))
  })

  it('sin nombre usa el correo en la confirmación y en la etiqueta accesible', async () => {
    const anon = member({ userId: 'u-anon', role: 'member', email: 'sin.nombre@acme.cl' })
    const user = setup([owner, anon], 'u-owner', 'owner')
    const dialog = await openRemoveDialog(user, 'sin.nombre@acme.cl')
    expect(within(dialog).getByText('¿Quitar a sin.nombre@acme.cl?')).toBeTruthy()
  })
})
