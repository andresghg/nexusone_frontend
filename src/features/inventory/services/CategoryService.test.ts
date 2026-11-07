import { describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/types/navigation'
import type { IAccessResolver } from '@/features/organization/services/AccessService'
import { CategoryService } from './CategoryService'
import type { ICategoryRepository } from './CategoryRepository'

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'

function setup(granted: Permission[] = ['pos.inventario.read', 'pos.inventario.write']) {
  const categories = {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'c-1' }),
    rename: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
  } satisfies ICategoryRepository

  const access = {
    authorize: vi.fn(async (_userId: string, organizationId: string, permission: Permission) =>
      organizationId === ORG_ID && granted.includes(permission)
        ? { organizationId: ORG_ID, role: 'member', permissions: granted }
        : null,
    ),
  } satisfies IAccessResolver

  return { categories, access, service: new CategoryService(categories, access) }
}

const duplicate = Object.assign(new Error('pg'), {
  code: '23505',
  constraint_name: 'product_categories_organization_id_name_key',
})

describe('CategoryService.list', () => {
  it('lista con permiso de lectura y devuelve vacío sin él o en otra empresa', async () => {
    const ok = setup(['pos.inventario.read'])
    await ok.service.list('u1', ORG_ID)
    expect(ok.categories.findAll).toHaveBeenCalledWith(ORG_ID)

    const none = setup(['pos.inventario.write'])
    expect(await none.service.list('u1', ORG_ID)).toEqual([])
    expect(none.categories.findAll).not.toHaveBeenCalled()

    const other = setup()
    expect(await other.service.list('u1', OTHER_ORG_ID)).toEqual([])
    expect(other.categories.findAll).not.toHaveBeenCalled()
  })
})

describe('CategoryService.create', () => {
  it('crea con el nombre recortado, dentro de la empresa del acceso', async () => {
    const { categories, service } = setup()
    const result = await service.create('u1', ORG_ID, '  Bebidas ')
    expect(result).toEqual({ error: '', success: 'Categoría creada' })
    expect(categories.create).toHaveBeenCalledWith(ORG_ID, 'Bebidas')
  })

  it('un member (solo lectura) y otra empresa no pueden crear', async () => {
    const member = setup(['pos.inventario.read'])
    expect((await member.service.create('u1', ORG_ID, 'X')).error).toBe('No tienes permisos para modificar el inventario')
    expect(member.categories.create).not.toHaveBeenCalled()

    const other = setup()
    expect((await other.service.create('u1', OTHER_ORG_ID, 'X')).error).not.toBe('')
    expect(other.categories.create).not.toHaveBeenCalled()
  })

  it('traduce el nombre repetido y relanza lo demás', async () => {
    const dup = setup()
    dup.categories.create.mockRejectedValue(duplicate)
    expect((await dup.service.create('u1', ORG_ID, 'Bebidas')).error).toBe('Ya existe una categoría con ese nombre')

    const boom = setup()
    boom.categories.create.mockRejectedValue(new Error('boom'))
    await expect(boom.service.create('u1', ORG_ID, 'Bebidas')).rejects.toThrow('boom')
  })
})

describe('CategoryService.rename y remove', () => {
  it('renombra y elimina dentro de la empresa del acceso', async () => {
    const { categories, service } = setup()
    expect((await service.rename('u1', ORG_ID, 'c-1', ' Nuevo ')).success).toBe('Categoría actualizada')
    expect(categories.rename).toHaveBeenCalledWith(ORG_ID, 'c-1', 'Nuevo')
    expect((await service.remove('u1', ORG_ID, 'c-1')).success).toBe('Categoría eliminada')
    expect(categories.remove).toHaveBeenCalledWith(ORG_ID, 'c-1')
  })

  it('avisa si la categoría no existe (o es de otra empresa)', async () => {
    const { categories, service } = setup()
    categories.rename.mockResolvedValue(false)
    categories.remove.mockResolvedValue(false)
    expect((await service.rename('u1', ORG_ID, 'c-9', 'X')).error).toBe('La categoría no existe')
    expect((await service.remove('u1', ORG_ID, 'c-9')).error).toBe('La categoría no existe')
  })

  it('renombrar con un nombre repetido da un mensaje claro', async () => {
    const { categories, service } = setup()
    categories.rename.mockRejectedValue(duplicate)
    expect((await service.rename('u1', ORG_ID, 'c-1', 'Bebidas')).error).toBe('Ya existe una categoría con ese nombre')
  })

  it('sin permiso de escritura no modifica nada', async () => {
    const { categories, service } = setup(['pos.inventario.read'])
    expect((await service.rename('u1', ORG_ID, 'c-1', 'X')).error).not.toBe('')
    expect((await service.remove('u1', ORG_ID, 'c-1')).error).not.toBe('')
    expect(categories.rename).not.toHaveBeenCalled()
    expect(categories.remove).not.toHaveBeenCalled()
  })
})
