import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCustomerAction,
  searchCustomersAction,
  setCustomerActiveAction,
  updateCustomerAction,
} from './customer-action'

const { create, update, setActive, search, getAuthUserId, revalidatePath } = vi.hoisted(() => ({
  create: vi.fn(),
  search: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  getAuthUserId: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('../services/CustomerService', () => ({ customerService: { create, update, setActive, search } }))
vi.mock('@/lib/supabase/get-user-id', () => ({ getAuthUserId }))
vi.mock('next/cache', () => ({ revalidatePath }))

const ORG = '11111111-1111-4111-8111-111111111111'
const CUSTOMER = '22222222-2222-4222-8222-222222222222'
const PATH = '/dashboard/[slug]/pos/clientes'
const form = (over = {}) => ({ name: 'Ana', taxId: '', email: '', phone: '', address: '', notes: '', ...over })

beforeEach(() => {
  for (const fn of [create, update, setActive, search, revalidatePath]) fn.mockReset()
  getAuthUserId.mockReset().mockResolvedValue('user-1')
})

describe('createCustomerAction', () => {
  it('datos inválidos: devuelve el primer mensaje y no toca el servicio', async () => {
    const result = await createCustomerAction({ ...form({ name: '' }), organizationId: ORG })
    expect(result).toEqual({ error: 'El nombre es obligatorio', success: '' })
    expect(create).not.toHaveBeenCalled()
    expect(getAuthUserId).not.toHaveBeenCalled()
  })

  it('sin sesión no crea', async () => {
    getAuthUserId.mockResolvedValue(undefined)
    expect(await createCustomerAction({ ...form(), organizationId: ORG })).toEqual({ error: 'Sesión no válida', success: '' })
    expect(create).not.toHaveBeenCalled()
  })

  it('crea con el usuario de la sesión, revalida la lista y devuelve el cliente creado', async () => {
    const customer = { id: CUSTOMER, name: 'Ana', taxId: null, email: null, address: null }
    create.mockResolvedValue({ error: '', success: 'Cliente creado', customer })
    const result = await createCustomerAction({ ...form({ name: ' Ana ' }), organizationId: ORG })
    expect(result).toEqual({ error: '', success: 'Cliente creado', customer })
    expect(create).toHaveBeenCalledWith('user-1', ORG, form({ name: 'Ana' }))
    expect(revalidatePath).toHaveBeenCalledWith(PATH, 'page')
  })

  it('si el servicio rechaza devuelve su error sin revalidar', async () => {
    create.mockResolvedValue({ error: 'Ya existe un cliente con ese RUT o identificación tributaria', success: '' })
    const result = await createCustomerAction({ ...form(), organizationId: ORG })
    expect(result.error).toContain('Ya existe un cliente')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si el servicio lanza, mensaje genérico sin filtrar detalles', async () => {
    create.mockRejectedValue(new Error('connection refused 10.0.0.5'))
    expect(await createCustomerAction({ ...form(), organizationId: ORG })).toEqual({
      error: 'No se pudo crear el cliente',
      success: '',
    })
  })
})

describe('updateCustomerAction', () => {
  it('rechaza un id de cliente inválido', async () => {
    const result = await updateCustomerAction({ ...form(), organizationId: ORG, customerId: 'x' })
    expect(result).toEqual({ error: 'Cliente inválido', success: '' })
    expect(update).not.toHaveBeenCalled()
  })

  it('separa empresa y cliente de los datos, y revalida', async () => {
    update.mockResolvedValue({ error: '', success: 'Cliente actualizado' })
    const result = await updateCustomerAction({ ...form(), organizationId: ORG, customerId: CUSTOMER })
    expect(result.success).toBe('Cliente actualizado')
    expect(update).toHaveBeenCalledWith('user-1', ORG, CUSTOMER, form())
    expect(revalidatePath).toHaveBeenCalledWith(PATH, 'page')
  })

  it('si el servicio lanza, mensaje genérico', async () => {
    update.mockRejectedValue(new Error('boom'))
    expect((await updateCustomerAction({ ...form(), organizationId: ORG, customerId: CUSTOMER })).error).toBe(
      'No se pudo actualizar el cliente',
    )
  })
})

describe('setCustomerActiveAction', () => {
  it('archiva con el usuario de la sesión y revalida', async () => {
    setActive.mockResolvedValue({ error: '', success: 'Cliente archivado' })
    const result = await setCustomerActiveAction({ organizationId: ORG, customerId: CUSTOMER, active: false })
    expect(result.success).toBe('Cliente archivado')
    expect(setActive).toHaveBeenCalledWith('user-1', ORG, CUSTOMER, false)
    expect(revalidatePath).toHaveBeenCalledWith(PATH, 'page')
  })

  it('rechaza datos inválidos y no toca el servicio', async () => {
    const result = await setCustomerActiveAction({ organizationId: ORG, customerId: CUSTOMER, active: 'si' as unknown as boolean })
    expect(result.error).not.toBe('')
    expect(setActive).not.toHaveBeenCalled()
  })

  it('sin sesión no cambia nada y, si el servicio lanza, mensaje genérico', async () => {
    getAuthUserId.mockResolvedValue(undefined)
    expect((await setCustomerActiveAction({ organizationId: ORG, customerId: CUSTOMER, active: false })).error).toBe('Sesión no válida')

    getAuthUserId.mockResolvedValue('user-1')
    setActive.mockRejectedValue(new Error('boom'))
    expect((await setCustomerActiveAction({ organizationId: ORG, customerId: CUSTOMER, active: false })).error).toBe(
      'No se pudo cambiar el estado del cliente',
    )
  })
})

describe('searchCustomersAction', () => {
  const option = { id: CUSTOMER, name: 'Ana', taxId: null, email: null, address: null }

  it('busca con el usuario de la sesión', async () => {
    search.mockResolvedValue([option])
    expect(await searchCustomersAction({ organizationId: ORG, query: ' ana ' })).toEqual({ error: '', customers: [option] })
    expect(search).toHaveBeenCalledWith('user-1', ORG, 'ana')
  })

  it('datos inválidos, sin sesión o con el servicio caído: lista vacía y un mensaje', async () => {
    expect((await searchCustomersAction({ organizationId: 'x', query: 'a' })).customers).toEqual([])
    expect((await searchCustomersAction({ organizationId: ORG, query: 'a'.repeat(101) })).error).toBe('La búsqueda admite máximo 100 caracteres')

    getAuthUserId.mockResolvedValue(undefined)
    expect(await searchCustomersAction({ organizationId: ORG, query: 'a' })).toEqual({ error: 'Sesión no válida', customers: [] })

    getAuthUserId.mockResolvedValue('user-1')
    search.mockRejectedValue(new Error('boom'))
    expect(await searchCustomersAction({ organizationId: ORG, query: 'a' })).toEqual({ error: 'No se pudo buscar clientes', customers: [] })
  })
})
