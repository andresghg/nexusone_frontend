import { and, eq, inArray } from 'drizzle-orm'
import { pgSchema, text, uuid } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import { organizationMembers } from '@/db/schema'
import type { MemberRow } from '../types/member'

// `authUsers` de drizzle-orm/supabase solo trae `id`; necesitamos el email.
// Esta definición local NO se exporta desde db/schema, así que drizzle-kit la ignora.
const authUsersWithEmail = pgSchema('auth').table('users', {
  id: uuid('id').primaryKey(),
  email: text('email'),
})

export interface IMemberRepository {
  findAll(organizationId: string): Promise<MemberRow[]>
  findOne(organizationId: string, userId: string): Promise<{ userId: string; role: string } | undefined>
  updateRole(organizationId: string, userId: string, role: string): Promise<void>
  remove(organizationId: string, userId: string): Promise<void>
}

class MemberRepository implements IMemberRepository {
  async findAll(organizationId: string) {
    const members = await db.query.organizationMembers.findMany({
      where: { organizationId },
      with: { profile: true },
      orderBy: { createdAt: 'asc' },
    })

    const ids = members.map((m) => m.userId)
    const users = ids.length
      ? await db
          .select({ id: authUsersWithEmail.id, email: authUsersWithEmail.email })
          .from(authUsersWithEmail)
          .where(inArray(authUsersWithEmail.id, ids))
      : []
    const emailById = new Map(users.map((u) => [u.id, u.email]))

    return members.map((m): MemberRow => ({
      userId: m.userId,
      role: m.role,
      fullName: m.profile?.fullName ?? null,
      avatarUrl: m.profile?.avatarUrl ?? null,
      email: emailById.get(m.userId) ?? null,
      joinedAt: m.createdAt.toISOString(),
    }))
  }

  async findOne(organizationId: string, userId: string) {
    return db.query.organizationMembers.findFirst({
      where: { organizationId, userId },
      columns: { userId: true, role: true },
    })
  }

  async updateRole(organizationId: string, userId: string, role: string) {
    await db
      .update(organizationMembers)
      .set({ role })
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ))
  }

  async remove(organizationId: string, userId: string) {
    await db
      .delete(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ))
  }
}

export const memberRepository = new MemberRepository()