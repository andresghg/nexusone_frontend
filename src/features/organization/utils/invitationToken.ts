import { createHash, randomBytes } from 'node:crypto'

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function generateInvitationToken() {
  const token = randomBytes(32).toString('base64url') // 256 bits, apto para URL
  return { token, tokenHash: hashInvitationToken(token) }
}