import type { ChangeRoleInput } from '../schemas/memberSchema'
import { memberRepository, type IMemberRepository } from './MemberRepository'
import { organizationRepository, type IOrganizationRepository } from './OrganizationRepository'

const fail = (error: string) => ({ error, success: '' })
const ok = (success: string) => ({ error: '', success })

export class MemberService {
  constructor(
    private members: IMemberRepository,
    private organizations: IOrganizationRepository,
  ) {}

  // El rol del actor se resuelve SIEMPRE dentro de la empresa indicada:
  // ser propietario de otra empresa no da ningún permiso en esta.
  private getActor(actorId: string, organizationId: string) {
    return this.organizations.findByUserAndId(actorId, organizationId)
  }

  async list(actorId: string, organizationId: string) {
    const actor = await this.getActor(actorId, organizationId)
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) return []
    return this.members.findAll(actor.id)
  }

  async changeRole(
    actorId: string,
    organizationId: string,
    targetUserId: string,
    role: ChangeRoleInput['role'],
  ) {
    const actor = await this.getActor(actorId, organizationId)
    if (!actor || actor.role !== 'owner') {
      return fail('Solo el propietario puede cambiar roles')
    }

    const target = await this.members.findOne(actor.id, targetUserId)
    if (!target) return fail('El usuario no pertenece a tu empresa')
    if (target.role === 'owner') return fail('No se puede cambiar el rol del propietario')

    await this.members.updateRole(actor.id, targetUserId, role)
    return ok('Rol actualizado')
  }

  async remove(actorId: string, organizationId: string, targetUserId: string) {
    const actor = await this.getActor(actorId, organizationId)
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
      return fail('No tienes permisos para quitar usuarios')
    }
    if (actorId === targetUserId) return fail('No puedes quitarte a ti mismo')

    const target = await this.members.findOne(actor.id, targetUserId)
    if (!target) return fail('El usuario no pertenece a tu empresa')
    if (target.role === 'owner') return fail('No se puede quitar al propietario')
    if (actor.role === 'admin' && target.role !== 'member') {
      return fail('Un administrador solo puede quitar miembros')
    }

    await this.members.remove(actor.id, targetUserId)
    return ok('Usuario quitado de la empresa')
  }
}

export const memberService = new MemberService(memberRepository, organizationRepository)