import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { organizationRepository } from '../services/OrganizationRepository'

export const getCurrentOrganization = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const organization = (await organizationRepository.findByUserAndId(user.id, '')) ?? null
  return { user, organization }
})

