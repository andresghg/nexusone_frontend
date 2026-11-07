import { describe, expect, it, vi } from 'vitest'
import { MAX_OWNED_ORGANIZATIONS } from '../constants'
import { OrganizationService } from './OrganizationService'
import type { IOrganizationRepository, OrganizationWithRole } from './OrganizationRepository'
import type { OrganizationInput } from '../schemas/organizationSchema'

const input = (over: Partial<OrganizationInput> = {}): OrganizationInput => ({
  name: 'Mi Empresa',
  legalName: '',
  taxId: '',
  businessActivity: '',
  address: '',
  commune: '',
  region: '',
  phone: '',
  contactEmail: '',
  ...over,
})

const membership = (id: string, role: string) => ({ id, role }) as OrganizationWithRole

function setup(memberships: OrganizationWithRole[] = []) {
  const repo = {
    findAllByUserId: vi.fn().mockResolvedValue(memberships),
    findByUserAndId: vi.fn(async (_userId: string, organizationId: string) =>
      memberships.find((m) => m.id === organizationId),
    ),
    findByUserAndSlug: vi.fn(),
    slugExists: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue({ id: 'org-new', slug: 'x' }),
    update: vi.fn(),
    findEnabledModuleKeys: vi.fn(),
  } satisfies IOrganizationRepository

  return { repo, service: new OrganizationService(repo) }
}

describe('OrganizationService.getCreationStatus', () => {
  it('quien no tiene ninguna empresa puede crear la primera', async () => {
    const { service } = setup()
    expect(await service.getCreationStatus('u1')).toEqual({ allowed: true })
  })

  it('un propietario puede crear empresas adicionales', async () => {
    const { service } = setup([membership('org-1', 'owner')])
    expect(await service.getCreationStatus('u1')).toEqual({ allowed: true })
  })

  it('quien solo es miembro o admin de otras empresas no puede crear', async () => {
    for (const role of ['member', 'admin']) {
      const { service } = setup([membership('org-1', role)])
      expect(await service.getCreationStatus('u1')).toEqual({
        allowed: false,
        reason: 'Solo un propietario puede crear más empresas',
      })
    }
  })

  it('un propietario en una empresa y miembro en otra puede crear', async () => {
    const { service } = setup([membership('org-1', 'member'), membership('org-2', 'owner')])
    expect(await service.getCreationStatus('u1')).toEqual({ allowed: true })
  })

  it('respeta el tope de empresas propias', async () => {
    const owned = Array.from({ length: MAX_OWNED_ORGANIZATIONS }, (_, i) => membership(`org-${i}`, 'owner'))
    const { service } = setup(owned)
    const status = await service.getCreationStatus('u1')
    expect(status.allowed).toBe(false)
    expect(status).toMatchObject({ reason: `Alcanzaste el máximo de ${MAX_OWNED_ORGANIZATIONS} empresas` })
  })

  it('las empresas donde solo es miembro no cuentan para el tope', async () => {
    const memberships = [
      ...Array.from({ length: MAX_OWNED_ORGANIZATIONS - 1 }, (_, i) => membership(`own-${i}`, 'owner')),
      membership('ajena-1', 'member'),
      membership('ajena-2', 'admin'),
    ]
    const { service } = setup(memberships)
    expect(await service.getCreationStatus('u1')).toEqual({ allowed: true })
  })
})

describe('OrganizationService.create', () => {
  it('no crea nada si no está permitido', async () => {
    const { repo, service } = setup([membership('org-1', 'member')])
    const result = await service.create('u1', input())
    expect(result.error).toBe('Solo un propietario puede crear más empresas')
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('un propietario crea una empresa adicional y queda como dueño', async () => {
    const { repo, service } = setup([membership('org-1', 'owner')])
    const result = await service.create('u1', input())
    expect(result.error).toBe('')
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 'u1' }))
  })

  it('genera el slug, normaliza el RUT y guarda vacíos como null', async () => {
    const { repo, service } = setup()
    await service.create('u1', input({ name: 'Panadería Ñandú', taxId: '123456785' }))
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Panadería Ñandú',
        slug: 'panaderia-nandu',
        ownerUserId: 'u1',
        taxId: '12.345.678-5',
        legalName: null,
        phone: null,
        contactEmail: null,
      }),
    )
  })

  it('si el slug ya existe, agrega un sufijo', async () => {
    const { repo, service } = setup()
    repo.slugExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await service.create('u1', input())
    const { slug } = repo.create.mock.calls[0][0]
    expect(slug).toMatch(/^mi-empresa-[a-z0-9]{1,4}$/)
  })

  it('usa "empresa" si el nombre no deja nada tras limpiar', async () => {
    const { repo, service } = setup()
    await service.create('u1', input({ name: '¡¡' }))
    expect(repo.create.mock.calls[0][0].slug).toBe('empresa')
  })

  it('devuelve el slug de la empresa creada', async () => {
    const { service } = setup()
    expect((await service.create('u1', input())).slug).toBe('x')
  })
})

describe('OrganizationService.update', () => {
  it.each(['admin', 'member'])('un %s no puede editar la empresa', async (role) => {
    const { repo, service } = setup([membership('org-1', role)])
    const result = await service.update('u1', 'org-1', input())
    expect(result.error).not.toBe('')
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('el owner actualiza la empresa indicada', async () => {
    const { repo, service } = setup([membership('org-1', 'owner')])
    const result = await service.update('u1', 'org-1', input({ name: 'Nuevo nombre' }))
    expect(result.error).toBe('')
    expect(repo.update).toHaveBeenCalledWith('org-1', expect.objectContaining({ name: 'Nuevo nombre' }))
  })

  it('ser owner de una empresa no permite editar otra', async () => {
    const { repo, service } = setup([membership('org-1', 'owner')])
    const result = await service.update('u1', 'org-2', input())
    expect(result.error).toBe('No tienes permisos para editar la empresa')
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('edita la empresa correcta cuando es owner en varias', async () => {
    const { repo, service } = setup([membership('org-1', 'owner'), membership('org-2', 'owner')])
    await service.update('u1', 'org-2', input({ name: 'Segunda' }))
    expect(repo.update).toHaveBeenCalledWith('org-2', expect.objectContaining({ name: 'Segunda' }))
  })
})
