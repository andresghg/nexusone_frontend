import { cache } from 'react'
import { notFound } from 'next/navigation'
import { organizationRepository } from '../services/OrganizationRepository'
import { getSessionUser } from './getSessionUser'

export const getActiveOrganization = cache(async (slug: string) => {
  const user = await getSessionUser()
  const organization = await organizationRepository.findByUserAndSlug(user.id, slug)
  // No es miembro o no existe: misma respuesta, así no se filtran empresas ajenas
  if (!organization) notFound()
  return { user, organization }
})