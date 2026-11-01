import { describe, expect, it } from 'vitest'
import { AcceptInvitationSchema } from '../schemas/invitationSchema'
import { generateInvitationToken, hashInvitationToken } from './invitationToken'

describe('invitationToken', () => {
  it('genera un token apto para URL y un hash SHA-256 distinto', () => {
    const { token, tokenHash } = generateInvitationToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(tokenHash).not.toBe(token)
  })

  it('el hash es determinista y coincide con el devuelto', () => {
    const { token, tokenHash } = generateInvitationToken()
    expect(hashInvitationToken(token)).toBe(tokenHash)
  })

  it('cada token es único', () => {
    expect(generateInvitationToken().token).not.toBe(generateInvitationToken().token)
  })

  it('los tokens generados siempre pasan la validación de aceptación', () => {
    const { token } = generateInvitationToken()
    expect(AcceptInvitationSchema.safeParse({ token }).success).toBe(true)
  })
})
