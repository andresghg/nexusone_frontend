// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from '../action/category-action'
import type { CategoryRow } from '../types/inventory'
import { CategoriesDialog } from './CategoriesDialog'

vi.mock('../action/category-action', () => ({
  createCategoryAction: vi.fn(),
  renameCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const ORG = '11111111-1111-4111-8111-111111111111'
const categories: CategoryRow[] = [
  { id: 'c-1', name: 'Bebidas', productCount: 3 },
  { id: 'c-2', name: 'Abarrotes', productCount: 0 },
  { id: 'c-3', name: 'Lácteos', productCount: 1 },
]

const create = vi.mocked(createCategoryAction)
const rename = vi.mocked(renameCategoryAction)
const remove = vi.mocked(deleteCategoryAction)
const ok = (success: string) => ({ error: '', success })

const setup = (list: CategoryRow[] = categories) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<CategoriesDialog open onOpenChange={() => {}} organizationId={ORG} categories={list} />)
  return user
}

beforeEach(() => {
  for (const mock of [create, rename, remove]) mock.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('CategoriesDialog', () => {
  it('lista las categorías con su cantidad de productos (singular y plural)', () => {
    setup()
    expect(screen.getByText('Bebidas')).toBeTruthy()
    expect(screen.getByText('3 productos')).toBeTruthy()
    expect(screen.getByText('0 productos')).toBeTruthy()
    expect(screen.getByText('1 producto')).toBeTruthy()
  })

  it('sin categorías lo dice', () => {
    setup([])
    expect(screen.getByText('Aún no tienes categorías.')).toBeTruthy()
  })

  it('crea una categoría con el nombre recortado por el servidor y limpia el campo', async () => {
    create.mockResolvedValue(ok('Categoría creada'))
    const user = setup()
    const input = screen.getByLabelText('Nombre de la nueva categoría') as HTMLInputElement

    await user.type(input, 'Snacks')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith({ organizationId: ORG, name: 'Snacks' }))
    await waitFor(() => expect(input.value).toBe(''))
    expect(toast.success).toHaveBeenCalledWith('Categoría creada')
  })

  it('"Agregar" está deshabilitado con el nombre vacío o solo espacios', async () => {
    const user = setup()
    const add = screen.getByRole('button', { name: 'Agregar' }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
    await user.type(screen.getByLabelText('Nombre de la nueva categoría'), '   ')
    expect(add.disabled).toBe(true)
  })

  it('un nombre repetido muestra el error y conserva lo escrito', async () => {
    create.mockResolvedValue({ error: 'Ya existe una categoría con ese nombre', success: '' })
    const user = setup()
    const input = screen.getByLabelText('Nombre de la nueva categoría') as HTMLInputElement

    await user.type(input, 'Bebidas')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ya existe una categoría con ese nombre'))
    expect(input.value).toBe('Bebidas')
  })

  it('renombra con Enter y vuelve a la lista', async () => {
    rename.mockResolvedValue(ok('Categoría actualizada'))
    const user = setup()

    await user.click(screen.getByRole('button', { name: 'Renombrar Bebidas' }))
    const input = screen.getByLabelText('Nuevo nombre para Bebidas')
    await user.clear(input)
    await user.type(input, 'Bebidas frías{Enter}')

    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith({ organizationId: ORG, categoryId: 'c-1', name: 'Bebidas frías' }),
    )
    await waitFor(() => expect(screen.queryByLabelText('Nuevo nombre para Bebidas')).toBeNull())
  })

  it('Escape cancela la edición sin guardar, y un nombre sin cambios no llama al servidor', async () => {
    const user = setup()

    await user.click(screen.getByRole('button', { name: 'Renombrar Bebidas' }))
    await user.type(screen.getByLabelText('Nuevo nombre para Bebidas'), ' X{Escape}')
    expect(rename).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Nuevo nombre para Bebidas')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Renombrar Bebidas' }))
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }))
    expect(rename).not.toHaveBeenCalled()
  })

  it('eliminar pide confirmación y explica que los productos no se borran', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar Bebidas' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('¿Eliminar la categoría Bebidas?')).toBeTruthy()
    expect(within(dialog).getByText('Sus 3 productos no se borran: quedarán sin categoría.')).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(remove).not.toHaveBeenCalled()
  })

  it('una categoría vacía lo indica, y al confirmar se elimina', async () => {
    remove.mockResolvedValue(ok('Categoría eliminada'))
    const user = setup()

    await user.click(screen.getByRole('button', { name: 'Eliminar Abarrotes' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('La categoría no tiene productos.')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith({ organizationId: ORG, categoryId: 'c-2' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Categoría eliminada'))
  })
})
