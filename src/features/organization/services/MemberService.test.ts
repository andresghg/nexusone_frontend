import { describe, expect, it, vi } from 'vitest'
import { MemberService } from './MemberService'
import type { IMemberRepository } from './MemberRepository'
import type { IOrganizationRepository, OrganizationWithRole } from './OrganizationRepository'

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'
const orgWithRole = (role: string) => ({ id: ORG_ID, role }) as OrganizationWithRole

// El actor solo tiene `actorRole` en ORG_ID; en cualquier otra empresa no es miembro.
function setup(actorRole?: string) {
  const members = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    updateRole: vi.fn(),
    remove: vi.fn(),
  } satisfies IMemberRepository

  const organizations = {
    findAllByUserId: vi.fn(),
    findByUserAndId: vi.fn(async (_userId: string, organizationId: string) =>
      actorRole && organizationId === ORG_ID ? orgWithRole(actorRole) : undefined,
    ),
    findByUserAndSlug: vi.fn(),
    slugExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findEnabledModuleKeys: vi.fn(),
  } satisfies IOrganizationRepository

  return { members, organizations, service: new MemberService(members, organizations) }
}

describe('MemberService.list', () => {
  it('owner y admin ven la lista de su empresa', async () => {
    for (const role of ['owner', 'admin']) {
      const { members, service } = setup(role)
      members.findAll.mockResolvedValue([])
      await service.list('u1', ORG_ID)
      expect(members.findAll).toHaveBeenCalledWith(ORG_ID)
    }
  })

  it('member y usuario sin membresía reciben lista vacía sin consultar', async () => {
    for (const role of ['member', undefined]) {
      const { members, service } = setup(role)
      expect(await service.list('u1', ORG_ID)).toEqual([])
      expect(members.findAll).not.toHaveBeenCalled()
    }
  })
})

describe('MemberService.changeRole', () => {
  it.each(['admin', 'member'])('un %s no puede cambiar roles', async (role) => {
    const { members, service } = setup(role)
    const result = await service.changeRole('u1', ORG_ID, 'u2', 'admin')
    expect(result.error).toBe('Solo el propietario puede cambiar roles')
    expect(members.updateRole).not.toHaveBeenCalled()
  })

  it('rechaza a alguien que no es de la empresa', async () => {
    const { members, service } = setup('owner')
    members.findOne.mockResolvedValue(undefined)
    const result = await service.changeRole('u1', ORG_ID, 'u2', 'admin')
    expect(result.error).toBe('El usuario no pertenece a tu empresa')
    expect(members.updateRole).not.toHaveBeenCalled()
  })

  it('no permite cambiar el rol del propietario', async () => {
    const { members, service } = setup('owner')
    members.findOne.mockResolvedValue({ userId: 'u2', role: 'owner' })
    const result = await service.changeRole('u1', ORG_ID, 'u2', 'member')
    expect(result.error).toBe('No se puede cambiar el rol del propietario')
    expect(members.updateRole).not.toHaveBeenCalled()
  })

  it('el propietario cambia un rol dentro de la empresa indicada', async () => {
    const { members, service } = setup('owner')
    members.findOne.mockResolvedValue({ userId: 'u2', role: 'member' })
    const result = await service.changeRole('u1', ORG_ID, 'u2', 'admin')
    expect(result.error).toBe('')
    expect(members.findOne).toHaveBeenCalledWith(ORG_ID, 'u2')
    expect(members.updateRole).toHaveBeenCalledWith(ORG_ID, 'u2', 'admin')
  })
})

describe('MemberService.remove', () => {
  it.each([
    ['owner', 'admin', true],
    ['owner', 'member', true],
    ['owner', 'owner', false],
    ['admin', 'member', true],
    ['admin', 'admin', false],
    ['admin', 'owner', false],
    ['member', 'member', false],
  ])('actor %s quitando a %s → permitido: %s', async (actorRole, targetRole, allowed) => {
    const { members, service } = setup(actorRole as string)
    members.findOne.mockResolvedValue({ userId: 'u2', role: targetRole })
    const result = await service.remove('u1', ORG_ID, 'u2')
    expect(result.error === '').toBe(allowed)
    expect(members.remove).toHaveBeenCalledTimes(allowed ? 1 : 0)
  })

  it('nadie puede quitarse a sí mismo', async () => {
    const { members, service } = setup('admin')
    const result = await service.remove('u1', ORG_ID, 'u1')
    expect(result.error).toBe('No puedes quitarte a ti mismo')
    expect(members.remove).not.toHaveBeenCalled()
  })

  it('rechaza a alguien que no es de la empresa', async () => {
    const { members, service } = setup('owner')
    members.findOne.mockResolvedValue(undefined)
    const result = await service.remove('u1', ORG_ID, 'u2')
    expect(result.error).toBe('El usuario no pertenece a tu empresa')
    expect(members.remove).not.toHaveBeenCalled()
  })
})

describe('aislamiento entre empresas', () => {
  it('ser propietario de una empresa no da permisos en otra', async () => {
    const { members, service } = setup('owner') // owner solo en ORG_ID

    const removed = await service.remove('u1', OTHER_ORG_ID, 'u2')
    const changed = await service.changeRole('u1', OTHER_ORG_ID, 'u2', 'admin')
    const listed = await service.list('u1', OTHER_ORG_ID)

    expect(removed.error).toBe('No tienes permisos para quitar usuarios')
    expect(changed.error).toBe('Solo el propietario puede cambiar roles')
    expect(listed).toEqual([])
    expect(members.findOne).not.toHaveBeenCalled()
    expect(members.remove).not.toHaveBeenCalled()
    expect(members.updateRole).not.toHaveBeenCalled()
    expect(members.findAll).not.toHaveBeenCalled()
  })

  it('el rol se evalúa en la empresa indicada: admin aquí no puede lo que owner allá', async () => {
    const { organizations, members, service } = setup()
    organizations.findByUserAndId.mockImplementation(async (_u: string, orgId: string) =>
      ({ id: orgId, role: orgId === ORG_ID ? 'admin' : 'owner' }) as OrganizationWithRole,
    )
    members.findOne.mockResolvedValue({ userId: 'u2', role: 'admin' })

    expect((await service.remove('u1', ORG_ID, 'u2')).error).toBe('Un administrador solo puede quitar miembros')
    expect((await service.remove('u1', OTHER_ORG_ID, 'u2')).error).toBe('')
  })
})
