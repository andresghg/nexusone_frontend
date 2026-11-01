import { describe, expect, it } from 'vitest'
import { safeNext } from './safeNext'

describe('safeNext', () => {
  it('permite volver a una invitación', () => {
    expect(safeNext('/invitacion/abc_DEF-123')).toBe('/invitacion/abc_DEF-123')
  })

  it.each([
    undefined,
    '',
    'https://evil.com',
    '//evil.com',
    '/invitacion/',
    '/invitacion/abc/../x',
    '/dashboard/pos',
  ])('cae a /dashboard con %s', (next) => {
    expect(safeNext(next)).toBe('/dashboard')
  })
})
