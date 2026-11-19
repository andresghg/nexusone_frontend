import { describe, expect, it } from 'vitest'
import {
  buildInventoryQuery,
  hasActiveFilters,
  parseInventoryParams,
  toFilters,
  type InventoryQuery,
} from './inventoryParams'

const CAT = '11111111-1111-4111-8111-111111111111'
const defaults: InventoryQuery = { q: '', category: '', status: 'active', low: false, page: 1 }

describe('parseInventoryParams', () => {
  it('sin parámetros devuelve los valores por defecto', () => {
    expect(parseInventoryParams({})).toEqual(defaults)
  })

  it('lee todos los parámetros válidos', () => {
    expect(
      parseInventoryParams({ q: ' cola ', category: CAT, status: 'archived', low: '1', page: '3' }),
    ).toEqual({ q: 'cola', category: CAT, status: 'archived', low: true, page: 3 })
  })

  it('valores inválidos o manipulados caen al valor por defecto', () => {
    expect(
      parseInventoryParams({ category: "x' or 1=1", status: 'borrados', low: 'true', page: '-4' }),
    ).toEqual(defaults)
    expect(parseInventoryParams({ page: 'abc' }).page).toBe(1)
    expect(parseInventoryParams({ page: '0' }).page).toBe(1)
    expect(parseInventoryParams({ page: '2.9' }).page).toBe(2)
  })

  it('con parámetros repetidos usa el primero, y recorta la búsqueda', () => {
    expect(parseInventoryParams({ q: ['uno', 'dos'], page: ['2', '5'] })).toMatchObject({ q: 'uno', page: 2 })
    expect(parseInventoryParams({ q: 'a'.repeat(500) }).q).toHaveLength(100)
  })
})

describe('toFilters', () => {
  it('traduce la consulta a filtros, omitiendo lo vacío', () => {
    expect(toFilters(defaults)).toEqual({
      search: undefined, categoryId: undefined, status: 'active', lowStock: undefined,
    })
    expect(toFilters({ q: 'cola', category: CAT, status: 'all', low: true, page: 4 })).toEqual({
      search: 'cola', categoryId: CAT, status: 'all', lowStock: true,
    })
  })
})

describe('buildInventoryQuery', () => {
  it('omite los valores por defecto', () => {
    expect(buildInventoryQuery(defaults)).toBe('')
    expect(buildInventoryQuery({})).toBe('')
    expect(buildInventoryQuery({ page: 1 })).toBe('')
  })

  it('serializa lo que no es por defecto y codifica los caracteres especiales', () => {
    expect(buildInventoryQuery({ q: 'a&b c', page: 2, low: true })).toBe('?q=a%26b+c&low=1&page=2')
    expect(buildInventoryQuery({ status: 'archived', category: CAT })).toBe(`?category=${CAT}&status=archived`)
  })

  it('es el inverso de parseInventoryParams', () => {
    const query: InventoryQuery = { q: 'coca & cola', category: CAT, status: 'all', low: true, page: 7 }
    const params = Object.fromEntries(new URLSearchParams(buildInventoryQuery(query)))
    expect(parseInventoryParams(params)).toEqual(query)
  })
})

describe('hasActiveFilters', () => {
  it('ignora la página y detecta cualquier filtro', () => {
    expect(hasActiveFilters({ ...defaults, page: 5 })).toBe(false)
    expect(hasActiveFilters({ ...defaults, q: 'x' })).toBe(true)
    expect(hasActiveFilters({ ...defaults, low: true })).toBe(true)
    expect(hasActiveFilters({ ...defaults, status: 'all' })).toBe(true)
    expect(hasActiveFilters({ ...defaults, category: CAT })).toBe(true)
  })
})
