import type { CreateInvitationInput } from '../schemas/invitationSchema'
import { generateInvitationToken, hashInvitationToken } from '../utils/invitationToken'
import { invitationRepository, type IInvitationRepository } from './InvitationRepository'
import { organizationRepository, type IOrganizationRepository } from './OrganizationRepository'

const TTL_MS = 72 * 60 * 60 * 1000 // 72 horas

const fail = (error: string) => ({ error, success: '' })

export class InvitationService {
  constructor(
    private invitations: IInvitationRepository,
    private organizations: IOrganizationRepository,
  ) {}

  // Solo owner y admin DE ESA empresa gestionan sus invitaciones
  private async getManager(userId: string, organizationId: string) {
    const org = await this.organizations.findByUserAndId(userId, organizationId)
    return org && (org.role === 'owner' || org.role === 'admin') ? org : null
  }

  async listPending(actorId: string, organizationId: string) {
    const actor = await this.getManager(actorId, organizationId)
    return actor ? this.invitations.findPending(actor.id) : []
  }

  async create(actorId: string, organizationId: string, role: CreateInvitationInput['role']) {
    const actor = await this.getManager(actorId, organizationId)
    if (!actor) return { ...fail('No tienes permisos para invitar usuarios'), token: '' }
    if (actor.role === 'admin' && role !== 'member') {
      return { ...fail('Un administrador solo puede invitar miembros'), token: '' }
    }

    const { token, tokenHash } = generateInvitationToken()
    await this.invitations.create({
      organizationId: actor.id,
      role,
      tokenHash,
      createdBy: actorId,
      expiresAt: new Date(Date.now() + TTL_MS),
    })
    return { error: '', success: 'Invitación creada', token }
  }

  async revoke(actorId: string, organizationId: string, invitationId: string) {
    const actor = await this.getManager(actorId, organizationId)
    if (!actor) return fail('No tienes permisos para revocar invitaciones')

    const revoked = await this.invitations.revoke(actor.id, invitationId)
    return revoked
      ? { error: '', success: 'Invitación revocada' }
      : fail('La invitación ya no está disponible')
  }

  // Vista previa pública del enlace. Con `userId` indica si esa persona ya es miembro.
  async preview(token: string, userId?: string) {
    const invitation = await this.invitations.findValidByTokenHash(hashInvitationToken(token))
    if (!invitation) return null

    const alreadyMember = userId
      ? !!(await this.organizations.findByUserAndId(userId, invitation.organizationId))
      : false

    return {
      organizationName: invitation.organizationName,
      role: invitation.role,
      alreadyMember,
    }
  }

  async accept(userId: string, token: string) {
    const invalid = { ...fail('La invitación no es válida o ya venció'), slug: '' }

    const invitation = await this.invitations.findValidByTokenHash(hashInvitationToken(token))
    if (!invitation) return invalid

    // Se puede pertenecer a varias empresas, pero no dos veces a la misma
    if (await this.organizations.findByUserAndId(userId, invitation.organizationId)) {
      return { ...fail('Ya perteneces a esta empresa'), slug: '' }
    }

    const accepted = await this.invitations.accept(invitation.id, userId)
    return accepted
      ? { error: '', success: 'Te uniste a la empresa', slug: invitation.organizationSlug }
      : invalid
  }
}

export const invitationService = new InvitationService(invitationRepository, organizationRepository)