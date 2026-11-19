import { describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/types/navigation'
import type { IAccessResolver } from '@/features/organization/services/AccessService'
import type { CustomerInput } from '../schemas/customerSchema'
import type { CustomerRow } from '../types/customers'
import { CustomerService } from './CustomerService'
import type { ICustomerRepository } from './CustomerRepository'

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'
const READ_WRITE: Permission[] = ['pos.clientes.read', 'pos.clientes.write']

const row = (over: Partial<CustomerRow> = {}): CustomerRow => ({
  id: 'c-1', name: 'Ana Pérez', taxId: '76123456-7', email: null, phone: null, address: null, notes: null,
  active: true, createdAt: '2026-11-01T00:00:00.000Z', ...over,
})
const input = (over: Partial<CustomerInput> = {}): CustomerInput => ({
  name: 'Ana Pérez', taxId: '', email: '', phone: '', address: '', notes: '', ...over,
})
const pgError = (constraint: string, code = '23505') => Object.assign(new Error('pg'), { code, constraint_name: constraint })

function setup(granted: Permission[] = READ_WRITE) {
  const repo = {
    findPage: vi.fn().mockResolvedValue({ rows: [row()], total: 1 }),
    findById: vi.fn().mockResolvedValue(row()),
    create: vi.fn().mockResolvedValue({ id: 'c-new' }),
    update: vi.fn().mockResolvedValue(true),
    setActive: vi.fn().mockResolvedValue(true),
  } satisfies ICustomerRepository

  const access = {
    authorize: vi.fn(async (_userId: string, organizationId: string, permission: Permission) =>
      organizationId === ORG_ID && granted.includes(permission)
        ? { organizationId: ORG_ID, role: 'member', permissions: granted }
        : null,
    ),
  } satisfies IAccessResolver

  return { repo, access, service: new CustomerService(repo, access) }
}

describe('CustomerService.list', () => {
  it('sin permiso de lectura devuelve vacío y no consulta la base', async () => {
    const { repo, service } = setup([])
    expect(await service.list('u1', ORG_ID)).toEqual({ rows: [], total: 0 })
    expect(repo.findPage).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { repo, service } = setup()
    expect(await service.list('u1', OTHER_ORG_ID)).toEqual({ rows: [], total: 0 })
    expect(repo.findPage).not.toHaveBeenCalled()
  })

  it('leer solo requiere pos.clientes.read y consulta con la empresa autorizada', async () => {
    const { repo, service } = setup(['pos.clientes.read'])
    expect(await service.list('u1', ORG_ID, { search: 'ana' })).toEqual({ rows: [row()], total: 1 })
    expect(repo.findPage).toHaveBeenCalledWith(ORG_ID, { search: 'ana' }, { page: 1, pageSize: 25 })
  })

  it('normaliza la paginación que llega de la URL', async () => {
    const { repo, service } = setup()
    const sizes = async (pagination: { page?: number; pageSize?: number }) => {
      repo.findPage.mockClear()
      await service.list('u1', ORG_ID, {}, pagination)
      return repo.findPage.mock.calls[0][2]
    }
    expect(await sizes({ page: NaN, pageSize: NaN })).toEqual({ page: 1, pageSize: 25 })
    expect(await sizes({ page: -3, pageSize: 0 })).toEqual({ page: 1, pageSize: 1 })
    expect(await sizes({ page: 2.9, pageSize: 10_000_000 })).toEqual({ page: 2, pageSize: 100 })
    expect(await sizes({ page: Infinity })).toEqual({ page: 1, pageSize: 25 })
  })
})

describe('CustomerService.create', () => {
  it('sin permiso de escritura no crea nada (leer no basta)', async () => {
    const { repo, service } = setup(['pos.clientes.read'])
    expect(await service.create('u1', ORG_ID, input())).toEqual({
      error: 'No tienes permisos para modificar clientes',
      success: '',
    })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { repo, service } = setup()
    expect((await service.create('u1', OTHER_ORG_ID, input())).error).toContain('No tienes permisos')
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('guarda los datos normalizados: RUT canónico, correo en minúsculas y vacíos como null', async () => {
    const { repo, service } = setup()
    const result = await service.create(
      'u1',
      ORG_ID,
      input({ name: '  Ana Pérez ', taxId: '76.123.456-k', email: ' ANA@Empresa.CL ', phone: ' 912345678 ' }),
    )
    expect(result).toEqual({
      error: '',
      success: 'Cliente creado',
      customer: { id: 'c-new', name: 'Ana Pérez', taxId: '76123456-K', email: 'ana@empresa.cl', address: null },
    })
    expect(repo.create).toHaveBeenCalledWith(ORG_ID, {
      name: 'Ana Pérez',
      taxId: '76123456-K',
      email: 'ana@empresa.cl',
      phone: '912345678',
      address: null,
      notes: null,
    })
  })

  it('un RUT escrito solo con puntos o espacios se guarda como null', async () => {
    const { repo, service } = setup()
    await service.create('u1', ORG_ID, input({ taxId: ' . ' }))
    expect(repo.create.mock.calls[0][1].taxId).toBeNull()
  })

  it('un RUT repetido devuelve un mensaje claro, no un error técnico', async () => {
    const { repo, service } = setup()
    repo.create.mockRejectedValue(pgError('customers_org_tax_id_key'))
    expect(await service.create('u1', ORG_ID, input({ taxId: '76123456-7' }))).toEqual({
      error: 'Ya existe un cliente con ese RUT o identificación tributaria',
      success: '',
    })
  })

  it('el error de unicidad también se reconoce envuelto por el driver (cause)', async () => {
    const { repo, service } = setup()
    repo.create.mockRejectedValue(new Error('Failed query', { cause: pgError('customers_org_tax_id_key') }))
    expect((await service.create('u1', ORG_ID, input())).error).toContain('Ya existe un cliente')
  })

  it('un error inesperado se relanza (la acción lo convierte en un mensaje genérico)', async () => {
    const { repo, service } = setup()
    repo.create.mockRejectedValue(new Error('conexión caída'))
    await expect(service.create('u1', ORG_ID, input())).rejects.toThrow('conexión caída')
    repo.create.mockRejectedValue(pgError('otra_restriccion_key'))
    await expect(service.create('u1', ORG_ID, input())).rejects.toBeDefined()
  })
})

describe('CustomerService.search', () => {
  it('sin permiso de lectura devuelve vacío', async () => {
    const { repo, service } = setup([])
    expect(await service.search('u1', ORG_ID, 'ana')).toEqual([])
    expect(repo.findPage).not.toHaveBeenCalled()
  })

  it('busca solo clientes vigentes, pocos, y devuelve lo mínimo para elegirlos', async () => {
    const { repo, service } = setup(['pos.clientes.read'])
    repo.findPage.mockResolvedValue({ rows: [row({ email: 'ana@x.cl', address: 'Av. 1', phone: '123', notes: 'vip' })], total: 1 })

    expect(await service.search('u1', ORG_ID, '  ana ')).toEqual([
      { id: 'c-1', name: 'Ana Pérez', taxId: '76123456-7', email: 'ana@x.cl', address: 'Av. 1' },
    ])
    expect(repo.findPage).toHaveBeenCalledWith(ORG_ID, { search: 'ana', status: 'active' }, { page: 1, pageSize: 8 })
  })

  it('un texto vacío lista los primeros clientes', async () => {
    const { repo, service } = setup()
    await service.search('u1', ORG_ID, '   ')
    expect(repo.findPage).toHaveBeenCalledWith(ORG_ID, { search: undefined, status: 'active' }, { page: 1, pageSize: 8 })
  })
})

describe('CustomerService.update', () => {
  it('sin permiso de escritura no modifica nada', async () => {
    const { repo, service } = setup(['pos.clientes.read'])
    expect((await service.update('u1', ORG_ID, 'c-1', input())).error).toContain('No tienes permisos')
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('actualiza solo dentro de la empresa autorizada y con datos normalizados', async () => {
    const { repo, service } = setup()
    const result = await service.update('u1', ORG_ID, 'c-1', input({ taxId: '12.345.678-5' }))
    expect(result).toEqual({ error: '', success: 'Cliente actualizado' })
    expect(repo.update).toHaveBeenCalledWith(ORG_ID, 'c-1', expect.objectContaining({ taxId: '12345678-5' }))
  })

  it('un cliente inexistente o de otra empresa devuelve "no existe"', async () => {
    const { repo, service } = setup()
    repo.update.mockResolvedValue(false)
    expect(await service.update('u1', ORG_ID, 'c-x', input())).toEqual({ error: 'El cliente no existe', success: '' })
  })

  it('cambiar a un RUT ya usado por otro cliente devuelve el mensaje claro', async () => {
    const { repo, service } = setup()
    repo.update.mockRejectedValue(pgError('customers_org_tax_id_key'))
    expect((await service.update('u1', ORG_ID, 'c-1', input())).error).toContain('Ya existe un cliente')
  })
})

describe('CustomerService.setActive', () => {
  it('archiva y restaura con su mensaje', async () => {
    const { repo, service } = setup()
    expect(await service.setActive('u1', ORG_ID, 'c-1', false)).toEqual({ error: '', success: 'Cliente archivado' })
    expect(await service.setActive('u1', ORG_ID, 'c-1', true)).toEqual({ error: '', success: 'Cliente restaurado' })
    expect(repo.setActive).toHaveBeenNthCalledWith(1, ORG_ID, 'c-1', false)
    expect(repo.setActive).toHaveBeenNthCalledWith(2, ORG_ID, 'c-1', true)
  })

  it('sin permiso de escritura no cambia nada', async () => {
    const { repo, service } = setup(['pos.clientes.read'])
    expect((await service.setActive('u1', ORG_ID, 'c-1', false)).error).toContain('No tienes permisos')
    expect(repo.setActive).not.toHaveBeenCalled()
  })

  it('un cliente inexistente devuelve "no existe"', async () => {
    const { repo, service } = setup()
    repo.setActive.mockResolvedValue(false)
    expect((await service.setActive('u1', ORG_ID, 'c-x', false)).error).toBe('El cliente no existe')
  })
})
