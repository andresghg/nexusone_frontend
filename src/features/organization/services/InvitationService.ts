import type { CreateInvitationInput } from '../schemas/invitationSchema'
import { generateInvitationToken, hashInvitationToken } from '../utils/invitationToken'
import { invitationRepository, type IInvitationRepository } from './InvitationRepository'
import { organizationRepository, type IOrganizationRepository } from './OrganizationRepository'

const TTL_MS = 72 * 60 * 60 * 1000 // 72 horas

const fail = (error: string) => ({ error, success: '' })

class InvitationService {
  constructor(
    private invitations: IInvitationRepository,
    private organizations: IOrganizationRepository,
  ) {}

  // Solo owner y admin gestionan invitaciones
  private async getManager(userId: string) {
    const org = await this.organizations.findByUserId(userId)
    return org && (org.role === 'owner' || org.role === 'admin') ? org : null
  }

  async listPending(actorId: string) {
    const actor = await this.getManager(actorId)
    return actor ? this.invitations.findPending(actor.id) : []
  }

  async create(actorId: string, role: CreateInvitationInput['role']) {
    const actor = await this.getManager(actorId)
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

  async revoke(actorId: string, invitationId: string) {
    const actor = await this.getManager(actorId)
    if (!actor) return fail('No tienes permisos para revocar invitaciones')

    const revoked = await this.invitations.revoke(actor.id, invitationId)
    return revoked
      ? { error: '', success: 'Invitación revocada' }
      : fail('La invitación ya no está disponible')
  }

  async preview(token: string) {
  const invitation = await this.invitations.findValidByTokenHash(hashInvitationToken(token))
  return invitation
    ? { organizationName: invitation.organizationName, role: invitation.role }
    : null
  }

async accept(userId: string, token: string) {
  // Regla de negocio: una empresa por usuario
  if (await this.organizations.findByUserId(userId)) {
    return fail('Ya perteneces a una empresa')
  }

  const invitation = await this.invitations.findValidByTokenHash(hashInvitationToken(token))
  if (!invitation) return fail('La invitación no es válida o ya venció')

  const accepted = await this.invitations.accept(invitation.id, userId)
  return accepted
    ? { error: '', success: 'Te uniste a la empresa' }
    : fail('La invitación no es válida o ya venció')
}
}

export const invitationService = new InvitationService(invitationRepository, organizationRepository)