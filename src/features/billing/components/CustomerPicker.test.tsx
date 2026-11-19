// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchCustomersAction } from '@/features/customers/action/customer-action'
import type { CustomerOption } from '@/features/customers/types/customers'
import { CustomerPicker } from './CustomerPicker'

vi.mock('@/features/customers/action/customer-action', () => ({ searchCustomersAction: vi.fn() }))

const ORG = '11111111-1111-4111-8111-111111111111'
const search = vi.mocked(searchCustomersAction)

const ana: CustomerOption = { id: 'c1', name: 'Ana Pérez', taxId: '12345678-5', email: 'ana@x.cl', address: null }
const sur: CustomerOption = { id: 'c2', name: 'Comercial Sur', taxId: null, email: null, address: null }

const setup = (props: { value?: CustomerOption | null; withCreate?: boolean } = {}) => {
  const onChange = vi.fn()
  const onCreate = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <CustomerPicker
      organizationId={ORG}
      value={props.value ?? null}
      onChange={onChange}
      onCreate={props.withCreate ? onCreate : undefined}
    />,
  )
  return { user, onChange, onCreate }
}
const trigger = () => screen.getByRole('combobox', { name: 'Cliente' })

beforeEach(() => {
  search.mockReset()
  search.mockResolvedValue({ error: '', customers: [ana, sur] })
})
afterEach(cleanup)

describe('CustomerPicker', () => {
  it('sin cliente elegido lo dice (consumidor final)', () => {
    setup()
    expect(trigger().textContent).toContain('Sin cliente')
  })

  it('con un cliente elegido muestra su nombre y RUT', () => {
    setup({ value: ana })
    expect(trigger().textContent).toContain('Ana Pérez')
    expect(trigger().textContent).toContain('12345678-5')
  })

  it('al abrir lista los clientes y al elegir uno avisa', async () => {
    const { user, onChange } = setup()
    await user.click(trigger())
    expect(search).toHaveBeenCalledWith({ organizationId: ORG, query: '' })

    await user.click(await screen.findByText('Comercial Sur'))
    expect(onChange).toHaveBeenCalledWith(sur)
  })

  it('busca con lo que se escribe', async () => {
    const { user } = setup()
    await user.click(trigger())
    await screen.findByText('Ana Pérez')
    search.mockClear()

    await user.type(screen.getByRole('combobox', { name: 'Buscar cliente' }), 'sur')
    await waitFor(() => expect(search).toHaveBeenCalledWith({ organizationId: ORG, query: 'sur' }))
  })

  it('"Quitar cliente" solo aparece si hay uno elegido, y lo quita', async () => {
    const without = setup()
    await without.user.click(trigger())
    await screen.findByText('Ana Pérez')
    expect(screen.queryByText(/Quitar cliente/)).toBeNull()
    cleanup()

    const { user, onChange } = setup({ value: ana })
    await user.click(trigger())
    await user.click(await screen.findByText(/Quitar cliente/))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('"Nuevo cliente" solo se ofrece si se puede crear, y avisa y cierra', async () => {
    const without = setup()
    await without.user.click(trigger())
    await screen.findByText('Ana Pérez')
    expect(screen.queryByText('Nuevo cliente')).toBeNull()
    cleanup()

    const { user, onCreate } = setup({ withCreate: true })
    await user.click(trigger())
    await user.click(await screen.findByText('Nuevo cliente'))
    expect(onCreate).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('Comercial Sur')).toBeNull())
  })

  it('sin resultados lo dice, con el texto buscado', async () => {
    search.mockImplementation(async ({ query }) => ({ error: '', customers: query ? [] : [ana] }))
    const { user } = setup()
    await user.click(trigger())
    await screen.findByText('Ana Pérez')
    await user.type(screen.getByRole('combobox', { name: 'Buscar cliente' }), 'zzz')
    expect(await screen.findByText('Sin resultados para "zzz"')).toBeTruthy()
  })

  it('si la búsqueda falla avisa para reintentar', async () => {
    search.mockResolvedValue({ error: 'No se pudo buscar clientes', customers: [] })
    const { user } = setup()
    await user.click(trigger())
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo buscar. Intenta de nuevo.')
  })
})
