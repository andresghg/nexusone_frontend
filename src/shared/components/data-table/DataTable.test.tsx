// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable } from './DataTable'
import type { DataTableColumn, RowAction } from './types'

type Item = { id: string; name: string; price: number; archived?: boolean }

const items: Item[] = [
  { id: '1', name: 'Cola', price: 1500 },
  { id: '2', name: 'Pan', price: 800, archived: true },
]

const columns: DataTableColumn<Item>[] = [
  { id: 'name', header: 'Producto', cell: (item) => item.name },
  { id: 'price', header: 'Precio', align: 'right', hideBelow: 'md', cell: (item) => `$${item.price}` },
]

const setup = (props: Partial<Parameters<typeof DataTable<Item>>[0]> = {}) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <DataTable<Item>
      columns={columns}
      rows={items}
      getRowId={(item) => item.id}
      getRowLabel={(item) => item.name}
      empty={<p>No hay nada</p>}
      {...props}
    />,
  )
  return user
}

afterEach(cleanup)

describe('DataTable · contenido', () => {
  it('muestra los encabezados y las celdas de cada fila', () => {
    setup()
    expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Precio' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Cola' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '$800' })).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(3) // encabezado + 2 filas
  })

  it('aplica alineación y visibilidad responsive a encabezado y celdas', () => {
    setup()
    for (const cell of [screen.getByRole('columnheader', { name: 'Precio' }), screen.getByRole('cell', { name: '$1500' })]) {
      expect(cell.className).toContain('text-right')
      expect(cell.className).toContain('hidden md:table-cell')
    }
    expect(screen.getByRole('cell', { name: 'Cola' }).className).not.toContain('hidden')
  })

  it('con `caption` lo expone solo a lectores de pantalla', () => {
    setup({ caption: 'Productos' })
    const caption = screen.getByText('Productos')
    expect(caption.tagName).toBe('CAPTION')
    expect(caption.className).toContain('sr-only')
  })

  it('con `rowClassName` marca las filas que corresponda', () => {
    setup({ rowClassName: (item) => item.archived && 'opacity-60' })
    expect(screen.getByRole('row', { name: /Pan/ }).className).toContain('opacity-60')
    expect(screen.getByRole('row', { name: /Cola/ }).className).not.toContain('opacity-60')
  })

  it('sin filas muestra el estado vacío y no dibuja la tabla', () => {
    setup({ rows: [] })
    expect(screen.getByText('No hay nada')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('DataTable · acciones por fila', () => {
  it('sin `rowActions` no hay columna de acciones', () => {
    setup()
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('una fila sin acciones no muestra menú, aunque otras sí', () => {
    setup({
      rowActions: (item) =>
        item.id === '1' ? [{ id: 'edit', label: 'Editar', onSelect: vi.fn() }] : [],
    })
    expect(screen.getByRole('button', { name: 'Acciones de Cola' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Acciones de Pan' })).toBeNull()
  })

  it('abre el menú y ejecuta la acción elegida', async () => {
    const edit = vi.fn()
    const user = setup({ rowActions: () => [{ id: 'edit', label: 'Editar', onSelect: edit }] })

    await user.click(screen.getByRole('button', { name: 'Acciones de Cola' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }))

    expect(edit).toHaveBeenCalledTimes(1)
  })

  it('las acciones pueden depender de la fila (p. ej. archivar o restaurar)', async () => {
    const user = setup({
      rowActions: (item): RowAction[] => [
        item.archived
          ? { id: 'restore', label: 'Restaurar', onSelect: vi.fn() }
          : { id: 'archive', label: 'Archivar', onSelect: vi.fn() },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Acciones de Pan' }))
    expect(await screen.findByRole('menuitem', { name: 'Restaurar' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archivar' })).toBeNull()
  })

  it('soporta separador y variante destructiva', async () => {
    const user = setup({
      rowActions: () => [
        { id: 'a', label: 'Editar', onSelect: vi.fn() },
        { id: 'b', label: 'Eliminar', variant: 'destructive', separatorBefore: true, onSelect: vi.fn() },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Acciones de Cola' }))
    const remove = await screen.findByRole('menuitem', { name: 'Eliminar' })
    expect(remove.getAttribute('data-variant')).toBe('destructive')
    expect(screen.getAllByRole('separator').length).toBeGreaterThan(0)
  })
})

describe('DataTable · confirmación', () => {
  const confirmable = (onSelect: () => void): RowAction[] => [
    {
      id: 'archive',
      label: 'Archivar',
      onSelect,
      confirm: { title: '¿Archivar Cola?', description: 'Se puede restaurar.', confirmLabel: 'Sí, archivar' },
    },
  ]

  it('pide confirmación y NO ejecuta la acción si se cancela', async () => {
    const onSelect = vi.fn()
    const user = setup({ rowActions: () => confirmable(onSelect) })

    await user.click(screen.getByRole('button', { name: 'Acciones de Cola' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('¿Archivar Cola?')).toBeTruthy()
    expect(within(dialog).getByText('Se puede restaurar.')).toBeTruthy()
    expect(onSelect).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ejecuta la acción al confirmar, con la etiqueta indicada', async () => {
    const onSelect = vi.fn()
    const user = setup({ rowActions: () => confirmable(onSelect) })

    await user.click(screen.getByRole('button', { name: 'Acciones de Cola' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archivar' }))
    await user.click(await screen.findByRole('button', { name: 'Sí, archivar' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('sin `confirmLabel` el botón dice "Confirmar"', async () => {
    const user = setup({
      rowActions: () => [
        { id: 'x', label: 'Borrar', onSelect: vi.fn(), confirm: { title: 'T', description: 'D' } },
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Acciones de Cola' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Borrar' }))
    expect(await screen.findByRole('button', { name: 'Confirmar' })).toBeTruthy()
  })
})

describe('DataTable · acciones asíncronas', () => {
  it('deshabilita el menú mientras la acción termina y lo habilita después', async () => {
    let finish: () => void = () => {}
    const slow = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const user = setup({ rowActions: () => [{ id: 'slow', label: 'Lenta', onSelect: slow }] })

    await user.click(screen.getByRole('button', { name: 'Acciones de Cola' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Lenta' }))

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Acciones de Cola' }) as HTMLButtonElement).disabled).toBe(true),
    )

    finish()
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Acciones de Cola' }) as HTMLButtonElement).disabled).toBe(false),
    )
  })

  it('una acción síncrona no deshabilita nada', async () => {
    const user = setup({ rowActions: () => [{ id: 'fast', label: 'Rápida', onSelect: vi.fn() }] })
    await user.click(screen.getByRole('button', { name: 'Acciones de Cola' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rápida' }))
    expect((screen.getByRole('button', { name: 'Acciones de Cola' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
