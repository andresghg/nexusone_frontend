// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QuerySpec, TableQuery } from '@/lib/table-query'
import { DataTablePagination } from './DataTablePagination'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/lista',
}))

const spec = { q: { kind: 'text' } } as const satisfies QuerySpec
const query = (page: number, q = ''): TableQuery => ({ filters: { q }, page })

const renderPagination = (page: number, total: number, q = '') =>
  render(<DataTablePagination spec={spec} query={query(page, q)} total={total} pageSize={25} />)

afterEach(cleanup)

describe('DataTablePagination', () => {
  it('sin resultados no muestra nada', () => {
    const { container } = renderPagination(1, 0)
    expect(container.innerHTML).toBe('')
  })

  it('primera página: rango, "Anterior" deshabilitado y "Siguiente" como enlace', () => {
    renderPagination(1, 120)
    expect(screen.getByText('1–25 de 120')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('link', { name: 'Siguiente' }).getAttribute('href')).toBe('/lista?page=2')
  })

  it('página intermedia: ambos enlaces, y conserva los filtros', () => {
    renderPagination(3, 120, 'cola')
    expect(screen.getByText('51–75 de 120')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Anterior' }).getAttribute('href')).toBe('/lista?q=cola&page=2')
    expect(screen.getByRole('link', { name: 'Siguiente' }).getAttribute('href')).toBe('/lista?q=cola&page=4')
  })

  it('al volver a la página 1 el enlace no lleva `page`', () => {
    renderPagination(2, 120)
    expect(screen.getByRole('link', { name: 'Anterior' }).getAttribute('href')).toBe('/lista')
  })

  it('última página: el rango termina en el total y "Siguiente" queda deshabilitado', () => {
    renderPagination(5, 120)
    expect(screen.getByText('101–120 de 120')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('una sola página: ambos botones deshabilitados', () => {
    renderPagination(1, 7)
    expect(screen.getByText('1–7 de 7')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
