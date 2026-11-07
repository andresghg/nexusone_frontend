// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Package } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataTableEmpty } from './DataTableEmpty'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/lista',
}))

const base = { icon: Package, title: 'Aún no hay nada', description: 'Crea el primero.' }

beforeEach(() => replace.mockClear())
afterEach(cleanup)

describe('DataTableEmpty', () => {
  it('sin filtros muestra el mensaje de "no hay datos" y la acción principal', () => {
    render(<DataTableEmpty {...base} filtered={false} action={<button>Crear</button>} />)
    expect(screen.getByText('Aún no hay nada')).toBeTruthy()
    expect(screen.getByText('Crea el primero.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Crear' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull()
  })

  it('sin filtros y sin acción (sin permiso) no inventa un botón', () => {
    render(<DataTableEmpty {...base} filtered={false} action={false} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('con filtros dice "Sin resultados", no ofrece crear y permite limpiar', async () => {
    const user = userEvent.setup()
    render(<DataTableEmpty {...base} filtered action={<button>Crear</button>} />)

    expect(screen.getByText('Sin resultados')).toBeTruthy()
    expect(screen.queryByText('Aún no hay nada')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Crear' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(replace).toHaveBeenCalledWith('/lista')
  })

  it('los textos de "sin resultados" se pueden personalizar', () => {
    render(<DataTableEmpty {...base} filtered filteredTitle="Nada por aquí" filteredDescription="Cambia la búsqueda." />)
    expect(screen.getByText('Nada por aquí')).toBeTruthy()
    expect(screen.getByText('Cambia la búsqueda.')).toBeTruthy()
  })
})
