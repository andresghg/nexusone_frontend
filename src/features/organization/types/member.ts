export type MemberRow = {
  userId: string
  role: string
  fullName: string | null
  avatarUrl: string | null
  email: string | null
  joinedAt: string // ISO, para pasarlo seguro a componentes cliente
}