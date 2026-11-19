import { describe, expect, it } from 'vitest'
import { isForeignKeyViolation, isUniqueViolation } from './pg-errors'

const pg = (code: string, constraint_name?: string) => ({ code, constraint_name })

describe('isUniqueViolation', () => {
  it('reconoce el código 23505, directo o dentro de `cause` (como lo envuelve Drizzle)', () => {
    expect(isUniqueViolation(pg('23505'))).toBe(true)
    expect(isUniqueViolation(Object.assign(new Error('Failed query'), { cause: pg('23505') }))).toBe(true)
  })

  it('filtra por parte del nombre de la restricción', () => {
    const error = pg('23505', 'products_organization_id_sku_key')
    expect(isUniqueViolation(error, 'sku')).toBe(true)
    expect(isUniqueViolation(error, 'barcode')).toBe(false)
  })

  it('acepta `constraint` (otros drivers) además de `constraint_name`', () => {
    expect(isUniqueViolation({ code: '23505', constraint: 'products_org_barcode_key' }, 'barcode')).toBe(true)
  })

  it('no confunde otros errores', () => {
    expect(isUniqueViolation(pg('23503'))).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation('texto')).toBe(false)
  })
})

describe('isForeignKeyViolation', () => {
  it('reconoce el código 23503, también envuelto', () => {
    expect(isForeignKeyViolation(pg('23503'))).toBe(true)
    expect(isForeignKeyViolation({ cause: pg('23503') })).toBe(true)
  })

  it('no confunde otros errores', () => {
    expect(isForeignKeyViolation(pg('23505'))).toBe(false)
    expect(isForeignKeyViolation(undefined)).toBe(false)
  })
})
