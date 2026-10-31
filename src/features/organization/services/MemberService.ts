import type { ChangeRoleInput } from '../schemas/memberSchema'
import { memberRepository, type IMemberRepository } from './MemberRepository'
import { organizationRepository, type IOrganizationRepository } from './OrganizationRepository'

const fail = (error: string) => ({ error, success: '' })
const ok = (success: string) => ({ error: '', success })

class MemberService {
  constructor(
    private members: IMemberRepository,
    private organizations: IOrganizationRepository,
  ) {}

  async list(actorId: string) {
    const org = await this.organizations.findByUserId(actorId)
    if (!org || (org.role !== 'owner' && org.role !== 'admin')) return []
    return this.members.findAll(org.id)
  }

  async changeRole(actorId: string, targetUserId: string, role: ChangeRoleInput['role']) {
    const actor = await this.organizations.findByUserId(actorId)
    if (!actor || actor.role !== 'owner') {
      return fail('Solo el propietario puede cambiar roles')
    }

    const target = await this.members.findOne(actor.id, targetUserId)
    if (!target) return fail('El usuario no pertenece a tu empresa')
    if (target.role === 'owner') return fail('No se puede cambiar el rol del propietario')

    await this.members.updateRole(actor.id, targetUserId, role)
    return ok('Rol actualizado')
  }

  async remove(actorId: string, targetUserId: string) {
    const actor = await this.organizations.findByUserId(actorId)
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