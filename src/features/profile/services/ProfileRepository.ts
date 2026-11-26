import 'server-only'
import { db } from '@/db'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'

class ProfileRepository {
  async findByUserId(userId: string) {
    const [profile] = await db
      .select({
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)

    return profile ?? null
  }
}

export const profileRepository = new ProfileRepository()