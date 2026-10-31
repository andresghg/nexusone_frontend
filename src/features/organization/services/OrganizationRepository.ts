import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { organizations, organizationMembers, organizationModules } from '@/db/schema'

// Alinea estas claves con los grupos de config/navigation.ts
export const INITIAL_MODULES = ['pos', 'gestion', 'finanzas'] as const

export type OrganizationData = {
  name: string
  legalName: string | null
  taxId: string | null
  businessActivity: string | null
  address: string | null
  commune: string | null
  region: string | null
  phone: string | null
  contactEmail: string | null
}

export type OrganizationWithRole = Omit<
  typeof organizations.$inferSelect,
  'createdAt' | 'updatedAt' | 'ownerUserId'
> & { role: string }

export interface IOrganizationRepository {
  findByUserId(userId: string): Promise<OrganizationWithRole | undefined>
  slugExists(slug: string): Promise<boolean>
  create(input: OrganizationData & { slug: string; ownerUserId: string }): Promise<{ id: string; slug: string }>
  findEnabledModuleKeys(organizationId: string): Promise<string[]>
  update(id: string, data: OrganizationData): Promise<void>
}

class OrganizationRepository implements IOrganizationRepository {
 async findByUserId(userId: string) {
  const membership = await db.query.organizationMembers.findFirst({
    where: { userId },
    with: {
      organization: {
        columns: { createdAt: false, updatedAt: false, ownerUserId: false },
      },
    },
  })
  if (!membership?.organization) return undefined
  return { ...membership.organization, role: membership.role }
}

async create(input: OrganizationData & { slug: string; ownerUserId: string }) {
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values(input) // el resto del método queda igual (owner + módulos)
      .returning({ id: organizations.id, slug: organizations.slug })

      // Si el trigger add_org_owner ya lo insertó, onConflictDoNothing evita el duplicado
      await tx.insert(organizationMembers)
        .values({ organizationId: org.id, userId: input.ownerUserId, role: 'owner' })
        .onConflictDoNothing()

      await tx.insert(organizationModules).values(
        INITIAL_MODULES.map((moduleKey) => ({ organizationId: org.id, moduleKey })),
      )
      return org
    })
  }

  async slugExists(slug: string) {
    const row = await db.query.organizations.findFirst({
      where: { slug },
      columns: { id: true },
    })
    return !!row
  }

  async findEnabledModuleKeys(organizationId: string) {
    const rows = await db.query.organizationModules.findMany({
      where: { organizationId, enabled: true },
      columns: { moduleKey: true },
    })
    return rows.map((r) => r.moduleKey)
  }

  async update(id: string, data: OrganizationData) {
    await db.update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
  }
}

export const organizationRepository = new OrganizationRepository()