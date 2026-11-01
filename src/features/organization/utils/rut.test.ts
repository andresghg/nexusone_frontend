import { describe, expect, it } from 'vitest'
import { formatRut, isValidRut } from './rut'

describe('isValidRut', () => {
  it.each(['11.111.111-1', '12.345.678-5', '123456785', '6-K', '6-k', '14-0'])(
    'acepta %s',
    (rut) => expect(isValidRut(rut)).toBe(true),
  )

  it.each(['12.345.678-9', '', '1', 'abc', 'K1234-5'])(
    'rechaza %s',
    (rut) => expect(isValidRut(rut)).toBe(false),
  )
})

describe('formatRut', () => {
  it.each([
    ['123456785', '12.345.678-5'],
    ['12345678-5', '12.345.678-5'],
    ['11111111-1', '11.111.111-1'],
    ['6k', '6-K'],
  ])('%s → %s', (input, expected) => expect(formatRut(input)).toBe(expected))
})
