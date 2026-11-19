import { MAX_OWNED_ORGANIZATIONS } from '../constants'
import { organizationRepository, type IOrganizationRepository } from './OrganizationRepository'
import { formatRut } from '../utils/rut'
import { slugify } from '../utils/slugify'
import type { OrganizationInput } from '../schemas/organizationSchema'

const toData = (d: OrganizationInput) => ({
  name: d.name,
  legalName: d.legalName || null,
  taxId: d.taxId ? formatRut(d.taxId) : null,
  businessActivity: d.businessActivity || null,
  address: d.address || null,
  commune: d.commune || null,
  region: d.region || null,
  phone: d.phone || null,
  contactEmail: d.contactEmail || null,
})

export type CreationStatus = { allowed: true } | { allowed: false; reason: string }

export class OrganizationService {
  constructor(private repo: IOrganizationRepository) {}

  // Primera empresa: cualquiera. Adicionales: solo quien ya es propietario, hasta el tope.
  async getCreationStatus(userId: string): Promise<CreationStatus> {
    const mine = await this.repo.findAllByUserId(userId)
    const owned = mine.filter((o) => o.role === 'owner').length

    if (mine.length > 0 && owned === 0) {
      return { allowed: false, reason: 'Solo un propietario puede crear más empresas' }
    }
    if (owned >= MAX_OWNED_ORGANIZATIONS) {
      return { allowed: false, reason: `Alcanzaste el máximo de ${MAX_OWNED_ORGANIZATIONS} empresas` }
    }
    return { allowed: true }
  }

  async create(userId: string, input: OrganizationInput) {
    const status = await this.getCreationStatus(userId)
    if (!status.allowed) return { error: status.reason, success: '', slug: '' }

    const base = slugify(input.name) || 'empresa'
    let slug = base
    while (await this.repo.slugExists(slug)) {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
    }

    const org = await this.repo.create({ ...toData(input), slug, ownerUserId: userId })
    return { error: '', success: 'Empresa registrada correctamente', slug: org.slug }
  }

  async update(userId: string, organizationId: string, input: OrganizationInput) {
    const org = await this.repo.findByUserAndId(userId, organizationId)
    if (!org || org.role !== 'owner') {
      return { error: 'No tienes permisos para editar la empresa', success: '' }
    }
    await this.repo.update(org.id, toData(input))
    return { error: '', success: 'Empresa actualizada' }
  }
}

export const organizationService = new OrganizationService(organizationRepository)