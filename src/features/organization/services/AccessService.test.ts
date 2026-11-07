import { describe, expect, it, vi } from 'vitest'
import { AccessService } from './AccessService'
import type { IOrganizationRepository, OrganizationWithRole } from './OrganizationRepository'

const ORG_ID = 'org-1'

// El usuario solo es miembro de ORG_ID, con `role`, y esa empresa tiene `modules` activos.
function setup(role: string | undefined, modules: string[]) {
  const repo = {
    findAllByUserId: vi.fn(),
    findByUserAndId: vi.fn(async (_userId: string, organizationId: string) =>
      role && organizationId === ORG_ID ? ({ id: ORG_ID, role } as OrganizationWithRole) : undefined,
    ),
    findByUserAndSlug: vi.fn(),
    slugExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findEnabledModuleKeys: vi.fn().mockResolvedValue(modules),
  } satisfies IOrganizationRepository

  return { repo, service: new AccessService(repo) }
}

describe('AccessService.resolve', () => {
  it('sin membresía en esa empresa no hay acceso ni se consultan módulos', async () => {
    const { repo, service } = setup(undefined, ['pos'])
    expect(await service.resolve('u1', ORG_ID)).toBeNull()
    expect(repo.findEnabledModuleKeys).not.toHaveBeenCalled()
  })

  it('combina el rol con los módulos activos de ESA empresa', async () => {
    const { repo, service } = setup('owner', ['pos'])
    const access = await service.resolve('u1', ORG_ID)
    expect(repo.findEnabledModuleKeys).toHaveBeenCalledWith(ORG_ID)
    expect(access?.role).toBe('owner')
    expect(access?.permissions).toContain('pos.inventario.write')
    expect(access?.permissions.some((p) => p.startsWith('finanzas.'))).toBe(false)
  })
})

describe('AccessService.authorize', () => {
  it('permite si el rol lo tiene y el módulo está activo', async () => {
    const { service } = setup('admin', ['pos'])
    expect(await service.authorize('u1', ORG_ID, 'pos.inventario.write')).toMatchObject({
      organizationId: ORG_ID,
      role: 'admin',
    })
  })

  it('niega si el módulo no está activo (no pagado), aunque el rol sea owner', async () => {
    const { service } = setup('owner', ['gestion'])
    expect(await service.authorize('u1', ORG_ID, 'pos.inventario.read')).toBeNull()
    expect(await service.authorize('u1', ORG_ID, 'pos.inventario.write')).toBeNull()
  })

  it('niega si no hay ningún módulo activo', async () => {
    const { service } = setup('owner', [])
    expect(await service.authorize('u1', ORG_ID, 'pos.inventario.read')).toBeNull()
  })

  it('un member lee inventario pero no lo modifica', async () => {
    const { service } = setup('member', ['pos'])
    expect(await service.authorize('u1', ORG_ID, 'pos.inventario.read')).not.toBeNull()
    expect(await service.authorize('u1', ORG_ID, 'pos.inventario.write')).toBeNull()
  })

  it('ser propietario de una empresa no da acceso a otra', async () => {
    const { service } = setup('owner', ['pos'])
    expect(await service.authorize('u1', 'org-2', 'pos.inventario.read')).toBeNull()
  })

  it('un rol desconocido no recibe nada', async () => {
    const { service } = setup('hacker', ['pos'])
    expect(await service.authorize('u1', ORG_ID, 'pos.inventario.read')).toBeNull()
  })
})