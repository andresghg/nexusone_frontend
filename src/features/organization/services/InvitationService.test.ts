import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvitationService } from './InvitationService'
import type { IInvitationRepository, ValidInvitation } from './InvitationRepository'
import type { IOrganizationRepository, OrganizationWithRole } from './OrganizationRepository'
import { hashInvitationToken } from '../utils/invitationToken'

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'
const orgWithRole = (id: string, role: string) => ({ id, role }) as OrganizationWithRole

// El actor solo tiene `actorRole` en ORG_ID; en cualquier otra empresa no es miembro.
function setup(actorRole?: string) {
  const invitations = {
    create: vi.fn(),
    findPending: vi.fn(),
    revoke: vi.fn(),
    findValidByTokenHash: vi.fn(),
    accept: vi.fn(),
  } satisfies IInvitationRepository

  const organizations = {
    findAllByUserId: vi.fn(),
    findByUserAndId: vi.fn(async (_userId: string, organizationId: string) =>
      actorRole && organizationId === ORG_ID ? orgWithRole(ORG_ID, actorRole) : undefined,
    ),
    findByUserAndSlug: vi.fn(),
    slugExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findEnabledModuleKeys: vi.fn(),
  } satisfies IOrganizationRepository

  return { invitations, organizations, service: new InvitationService(invitations, organizations) }
}

const validInvitation: ValidInvitation = {
  id: 'inv-1',
  organizationId: ORG_ID,
  organizationName: 'Acme',
  organizationSlug: 'acme',
  role: 'member',
}

afterEach(() => vi.useRealTimers())

describe('InvitationService.create', () => {
  it('un member no puede invitar', async () => {
    const { invitations, service } = setup('member')
    const result = await service.create('u1', ORG_ID, 'member')
    expect(result.error).not.toBe('')
    expect(result.token).toBe('')
    expect(invitations.create).not.toHaveBeenCalled()
  })

  it('un admin no puede invitar admins', async () => {
    const { invitations, service } = setup('admin')
    const result = await service.create('u1', ORG_ID, 'admin')
    expect(result.error).toBe('Un administrador solo puede invitar miembros')
    expect(invitations.create).not.toHaveBeenCalled()
  })

  it('un admin sí puede invitar miembros', async () => {
    const { service } = setup('admin')
    expect((await service.create('u1', ORG_ID, 'member')).error).toBe('')
  })

  it('el owner crea la invitación: guarda solo el hash y vence en 72 h', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'))
    const { invitations, service } = setup('owner')

    const result = await service.create('u1', ORG_ID, 'admin')

    expect(result.error).toBe('')
    expect(result.token).not.toBe('')
    expect(invitations.create).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      role: 'admin',
      tokenHash: hashInvitationToken(result.token),
      createdBy: 'u1',
      expiresAt: new Date('2026-11-04T12:00:00Z'),
    })
    expect(JSON.stringify(invitations.create.mock.calls)).not.toContain(result.token)
  })
})

describe('InvitationService.revoke', () => {
  it('un member no puede revocar', async () => {
    const { invitations, service } = setup('member')
    expect((await service.revoke('u1', ORG_ID, 'inv-1')).error).not.toBe('')
    expect(invitations.revoke).not.toHaveBeenCalled()
  })

  it('revoca solo dentro de la empresa indicada', async () => {
    const { invitations, service } = setup('admin')
    invitations.revoke.mockResolvedValue(true)
    const result = await service.revoke('u1', ORG_ID, 'inv-1')
    expect(result.error).toBe('')
    expect(invitations.revoke).toHaveBeenCalledWith(ORG_ID, 'inv-1')
  })

  it('avisa si la invitación ya no está disponible', async () => {
    const { invitations, service } = setup('owner')
    invitations.revoke.mockResolvedValue(false)
    expect((await service.revoke('u1', ORG_ID, 'inv-1')).error).toBe('La invitación ya no está disponible')
  })
})

describe('aislamiento entre empresas', () => {
  it('ser propietario de una empresa no permite invitar, listar ni revocar en otra', async () => {
    const { invitations, service } = setup('owner') // owner solo en ORG_ID

    const created = await service.create('u1', OTHER_ORG_ID, 'member')
    const revoked = await service.revoke('u1', OTHER_ORG_ID, 'inv-1')
    const listed = await service.listPending('u1', OTHER_ORG_ID)

    expect(created.error).toBe('No tienes permisos para invitar usuarios')
    expect(revoked.error).toBe('No tienes permisos para revocar invitaciones')
    expect(listed).toEqual([])
    expect(invitations.create).not.toHaveBeenCalled()
    expect(invitations.revoke).not.toHaveBeenCalled()
    expect(invitations.findPending).not.toHaveBeenCalled()
  })
})

describe('InvitationService.preview', () => {
  it('busca por hash, nunca por el token en claro', async () => {
    const { invitations, service } = setup()
    invitations.findValidByTokenHash.mockResolvedValue(validInvitation)
    const result = await service.preview('mi-token')
    expect(invitations.findValidByTokenHash).toHaveBeenCalledWith(hashInvitationToken('mi-token'))
    expect(result).toEqual({ organizationName: 'Acme', role: 'member', alreadyMember: false })
  })

  it('devuelve null si no es válida', async () => {
    const { invitations, service } = setup()
    invitations.findValidByTokenHash.mockResolvedValue(undefined)
    expect(await service.preview('x')).toBeNull()
  })

  it('sin usuario no consulta membresías', async () => {
    const { invitations, organizations, service } = setup()
    invitations.findValidByTokenHash.mockResolvedValue(validInvitation)
    await service.preview('tok')
    expect(organizations.findByUserAndId).not.toHaveBeenCalled()
  })

  it('indica si quien mira ya es miembro de esa empresa', async () => {
    const member = setup('member')
    member.invitations.findValidByTokenHash.mockResolvedValue(validInvitation)
    expect((await member.service.preview('tok', 'u2'))?.alreadyMember).toBe(true)

    const outsider = setup()
    outsider.invitations.findValidByTokenHash.mockResolvedValue(validInvitation)
    expect((await outsider.service.preview('tok', 'u2'))?.alreadyMember).toBe(false)
  })
})

describe('InvitationService.accept', () => {
  it('rechaza a quien ya es miembro de ESA empresa, sin consumir la invitación', async () => {
    const { invitations, service } = setup('member')
    invitations.findValidByTokenHash.mockResolvedValue(validInvitation)
    const result = await service.accept('u2', 'tok')
    expect(result.error).toBe('Ya perteneces a esta empresa')
    expect(invitations.accept).not.toHaveBeenCalled()
  })

  it('permite aceptar aunque ya pertenezca a OTRAS empresas', async () => {
    const { invitations, organizations, service } = setup()
    organizations.findByUserAndId.mockImplementation(async (_u: string, orgId: string) =>
      orgId === 'org-9' ? orgWithRole('org-9', 'owner') : undefined,
    )
    invitations.findValidByTokenHash.mockResolvedValue(validInvitation)
    invitations.accept.mockResolvedValue(true)

    const result = await service.accept('u2', 'tok')

    expect(result.error).toBe('')
    expect(invitations.accept).toHaveBeenCalledWith('inv-1', 'u2')
  })

  it('devuelve el slug de la empresa a la que se unió', async () => {
    const { invitations, service } = setup()
    invitations.findValidByTokenHash.mockResolvedValue(validInvitation)
    invitations.accept.mockResolvedValue(true)
    expect((await service.accept('u2', 'tok')).slug).toBe('acme')
  })

  it('rechaza una invitación inválida, vencida, usada o revocada', async () => {
    const { invitations, organizations, service } = setup()
    invitations.findValidByTokenHash.mockResolvedValue(undefined)
    const result = await service.accept('u2', 'tok')
    expect(result.error).toBe('La invitación no es válida o ya venció')
    expect(organizations.findByUserAndId).not.toHaveBeenCalled()
    expect(invitations.accept).not.toHaveBeenCalled()
  })

  it('rechaza si otra petición la reclamó primero', async () => {
    const { invitations, service } = setup()
    invitations.findValidByTokenHash.mockResolvedValue(validInvitation)
    invitations.accept.mockResolvedValue(false)
    const result = await service.accept('u2', 'tok')
    expect(result.error).toBe('La invitación no es válida o ya venció')
    expect(result.slug).toBe('')
  })
})
