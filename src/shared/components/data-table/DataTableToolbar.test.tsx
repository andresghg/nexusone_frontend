// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuerySpec, TableQuery } from '@/lib/table-query'
import { DataTableToolbar } from './DataTableToolbar'
import type { ToolbarControl } from './types'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/dashboard/acme/pos/inventario',
}))

const PATH = '/dashboard/acme/pos/inventario'
const CAT = '11111111-1111-4111-8111-111111111111'

const spec = {
  q: { kind: 'text' },
  category: { kind: 'uuid' },
  status: { kind: 'enum', values: ['active', 'archived', 'all'], default: 'active' },
  low: { kind: 'flag' },
} as const satisfies QuerySpec

const controls: ToolbarControl[] = [
  { type: 'search', key: 'q', placeholder: 'Buscar', ariaLabel: 'Buscar productos' },
  {
    type: 'select',
    key: 'category',
    ariaLabel: 'Filtrar por categoría',
    emptyOption: 'Todas las categorías',
    options: [{ value: CAT, label: 'Bebidas' }],
  },
  {
    type: 'select',
    key: 'status',
    ariaLabel: 'Filtrar por estado',
    options: [
      { value: 'active', label: 'Activos' },
      { value: 'archived', label: 'Archivados' },
      { value: 'all', label: 'Todos' },
    ],
  },
  { type: 'toggle', key: 'low', label: 'Stock bajo' },
]

const query = (filters: Partial<Record<string, string>> = {}, page = 1): TableQuery => ({
  filters: { q: '', category: '', status: 'active', low: '', ...filters },
  page,
})

const renderToolbar = (q: TableQuery) =>
  render(<DataTableToolbar spec={spec} query={q} controls={controls} />)

beforeEach(() => replace.mockClear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DataTableToolbar · búsqueda', () => {
  // Testing Library espera con un setTimeout real que, con relojes simulados, nunca avanza salvo que
  // detecte un `jest` global: este adaptador le enseña a avanzar los relojes simulados de Vitest.
  beforeEach(() => {
    ;(globalThis as unknown as { jest: unknown }).jest = {
      advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
    }
  })
  afterEach(() => {
    delete (globalThis as unknown as { jest?: unknown }).jest
  })

  it('espera 300 ms sin escribir antes de actualizar la URL, y vuelve a la página 1', async () => {
    vi.useFakeTimers()
    const user = userEvent.setup({ delay: null }) // sin esperas entre teclas: el tiempo lo controla vi.useFakeTimers
    renderToolbar(query({}, 3))

    await user.type(screen.getByRole('textbox', { name: 'Buscar productos' }), 'cola')
    expect(replace).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(299))
    expect(replace).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(2))
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(`${PATH}?q=cola`) // sin `page`: volvió a la primera
  })

  it('seguir escribiendo reinicia la espera: una sola actualización', async () => {
    vi.useFakeTimers()
    const user = userEvent.setup({ delay: null }) // sin esperas entre teclas: el tiempo lo controla vi.useFakeTimers
    renderToolbar(query())
    const input = screen.getByRole('textbox', { name: 'Buscar productos' })

    await user.type(input, 'co')
    await act(() => vi.advanceTimersByTimeAsync(200))
    await user.type(input, 'la')
    await act(() => vi.advanceTimersByTimeAsync(400))

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(`${PATH}?q=cola`)
  })

  it('conserva los otros filtros al buscar', async () => {
    vi.useFakeTimers()
    const user = userEvent.setup({ delay: null }) // sin esperas entre teclas: el tiempo lo controla vi.useFakeTimers
    renderToolbar(query({ low: '1', status: 'all' }))

    await user.type(screen.getByRole('textbox', { name: 'Buscar productos' }), 'pan')
    await act(() => vi.advanceTimersByTimeAsync(400))

    expect(replace).toHaveBeenCalledWith(`${PATH}?q=pan&status=all&low=1`)
  })

  it('el campo sigue a la URL cuando cambia desde fuera (p. ej. "Limpiar")', () => {
    const { rerender } = renderToolbar(query({ q: 'abc' }))
    const input = () => screen.getByRole('textbox', { name: 'Buscar productos' }) as HTMLInputElement
    expect(input().value).toBe('abc')

    rerender(<DataTableToolbar spec={spec} query={query()} controls={controls} />)
    expect(input().value).toBe('')
  })

  it('no pisa lo que se está escribiendo cuando la URL se pone al día', () => {
    const { rerender } = renderToolbar(query())
    const input = screen.getByRole('textbox', { name: 'Buscar productos' }) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'cola ' } }) // el usuario escribió un espacio final
    rerender(<DataTableToolbar spec={spec} query={query({ q: 'cola' })} controls={controls} />)

    expect(input.value).toBe('cola ')
  })
})

describe('DataTableToolbar · interruptor y limpiar', () => {
  it('el interruptor activa y desactiva su filtro, reflejado en aria-pressed', async () => {
    const user = userEvent.setup()
    const { rerender } = renderToolbar(query({ q: 'x' }, 2))

    const toggle = screen.getByRole('button', { name: 'Stock bajo' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await user.click(toggle)
    expect(replace).toHaveBeenLastCalledWith(`${PATH}?q=x&low=1`) // conserva q, vuelve a la página 1

    rerender(<DataTableToolbar spec={spec} query={query({ q: 'x', low: '1' })} controls={controls} />)
    expect(screen.getByRole('button', { name: 'Stock bajo' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Stock bajo' }))
    expect(replace).toHaveBeenLastCalledWith(`${PATH}?q=x`)
  })

  it('"Limpiar" solo aparece con filtros activos y borra todos', async () => {
    const user = userEvent.setup()
    const { rerender } = renderToolbar(query({}, 4)) // la página no cuenta como filtro
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()

    rerender(<DataTableToolbar spec={spec} query={query({ status: 'archived' })} controls={controls} />)
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(replace).toHaveBeenCalledWith(PATH)
  })
})

describe('DataTableToolbar · selects', () => {
  it('elegir una opción actualiza su filtro', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderToolbar(query({ q: 'x' }, 2))

    await user.click(screen.getByRole('combobox', { name: 'Filtrar por categoría' }))
    await user.click(await screen.findByRole('option', { name: 'Bebidas' }))

    expect(replace).toHaveBeenCalledWith(`${PATH}?q=x&category=${CAT}`)
  })

  it('la opción "sin filtro" limpia el valor', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderToolbar(query({ category: CAT }))

    await user.click(screen.getByRole('combobox', { name: 'Filtrar por categoría' }))
    await user.click(await screen.findByRole('option', { name: 'Todas las categorías' }))

    expect(replace).toHaveBeenCalledWith(PATH)
  })

  it('un select sin opción vacía muestra su valor actual', () => {
    renderToolbar(query({ status: 'archived' }))
    expect(screen.getByRole('combobox', { name: 'Filtrar por estado' }).textContent).toContain('Archivados')
  })
})
