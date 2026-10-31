import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { organizationInvitations, organizationMembers, organizations } from '@/db/schema'
import type { InvitationRow } from '../types/invitation'

export type NewInvitation = {
  organizationId: string
  role: string
  tokenHash: string
  createdBy: string
  expiresAt: Date
}

export type ValidInvitation = {
  id: string
  organizationId: string
  organizationName: string
  role: string
}

export interface IInvitationRepository {
  create(input: NewInvitation): Promise<void>
  findPending(organizationId: string): Promise<InvitationRow[]>
  revoke(organizationId: string, invitationId: string): Promise<boolean>
  findValidByTokenHash(tokenHash: string): Promise<ValidInvitation | undefined>
  accept(invitationId: string, userId: string): Promise<boolean>
}

class InvitationRepository implements IInvitationRepository {
  async create(input: NewInvitation) {
    await db.insert(organizationInvitations).values(input)
  }

  async findPending(organizationId: string) {
    const rows = await db
      .select({
        id: organizationInvitations.id,
        role: organizationInvitations.role,
        expiresAt: organizationInvitations.expiresAt,
        createdAt: organizationInvitations.createdAt,
      })
      .from(organizationInvitations)
      .where(and(
        eq(organizationInvitations.organizationId, organizationId),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.revokedAt),
        gt(organizationInvitations.expiresAt, new Date()),
      ))
      .orderBy(desc(organizationInvitations.createdAt))

    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }))
  }

  async revoke(organizationId: string, invitationId: string) {
    const rows = await db
      .update(organizationInvitations)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(organizationInvitations.id, invitationId),
        eq(organizationInvitations.organizationId, organizationId),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.revokedAt),
      ))
      .returning({ id: organizationInvitations.id })
    return rows.length > 0
  }

  async findValidByTokenHash(tokenHash: string) {
  const [row] = await db
    .select({
      id: organizationInvitations.id,
      organizationId: organizationInvitations.organizationId,
      organizationName: organizations.name,
      role: organizationInvitations.role,
    })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
    .where(and(
      eq(organizationInvitations.tokenHash, tokenHash),
      isNull(organizationInvitations.acceptedAt),
      isNull(organizationInvitations.revokedAt),
      gt(organizationInvitations.expiresAt, new Date()),
    ))
    .limit(1)
  return row
}

async accept(invitationId: string, userId: string) {
  return db.transaction(async (tx) => {
    // Reclamo atómico: solo una petición puede marcarla como usada
    const [claimed] = await tx
      .update(organizationInvitations)
      .set({ acceptedAt: new Date(), acceptedBy: userId })
      .where(and(
        eq(organizationInvitations.id, invitationId),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.revokedAt),
        gt(organizationInvitations.expiresAt, new Date()),
      ))
      .returning({
        organizationId: organizationInvitations.organizationId,
        role: organizationInvitations.role,
      })

    if (!claimed) return false

    await tx
      .insert(organizationMembers)
      .values({ organizationId: claimed.organizationId, userId, role: claimed.role })
      .onConflictDoNothing()
    return true
  })
}
}

export const invitationRepository = new InvitationRepository()