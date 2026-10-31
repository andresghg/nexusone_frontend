import { organizationRepository, type IOrganizationRepository } from './OrganizationRepository'
import { slugify } from '../utils/slugify'
import { formatRut } from '../utils/rut'
import type { OrganizationInput as SchemaOrganizationInput } from '../schemas/organizationSchema'

const toData = (d: SchemaOrganizationInput) => ({
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

class OrganizationService {
  constructor(private repo: IOrganizationRepository) {}

  async create(userId: string, input: SchemaOrganizationInput) {
    if (await this.repo.findByUserId(userId)) {
      return { error: 'Ya tienes una empresa registrada', success: '' }
    }
    const base = slugify(input.name) || 'empresa'
    let slug = base
    while (await this.repo.slugExists(slug)) {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
    }
    await this.repo.create({ ...toData(input), slug, ownerUserId: userId })
    return { error: '', success: 'Empresa registrada correctamente' }
  }

  async update(userId: string, input: SchemaOrganizationInput) {
    const org = await this.repo.findByUserId(userId)
    if (!org || org.role !== 'owner') {
      return { error: 'No tienes permisos para editar la empresa', success: '' }
    }
    await this.repo.update(org.id, toData(input))
    return { error: '', success: 'Empresa actualizada' }
  }
}

export const organizationService = new OrganizationService(organizationRepository)