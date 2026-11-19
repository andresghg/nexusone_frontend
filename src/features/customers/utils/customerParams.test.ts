import { describe, expect, it } from 'vitest'
import {
  buildCustomersQuery,
  hasActiveFilters,
  parseCustomerParams,
  toFilters,
  type CustomersQuery,
} from './customerParams'

const defaults: CustomersQuery = { q: '', status: 'active', page: 1 }

describe('parseCustomerParams', () => {
  it('sin parámetros devuelve los valores por defecto', () => {
    expect(parseCustomerParams({})).toEqual(defaults)
  })

  it('lee los parámetros válidos y recorta la búsqueda', () => {
    expect(parseCustomerParams({ q: ' ana ', status: 'archived', page: '3' })).toEqual({
      q: 'ana',
      status: 'archived',
      page: 3,
    })
  })

  it('valores inválidos o manipulados caen al valor por defecto', () => {
    expect(parseCustomerParams({ status: 'borrados', page: '-4' })).toEqual(defaults)
    expect(parseCustomerParams({ page: 'abc' }).page).toBe(1)
    expect(parseCustomerParams({ page: '0' }).page).toBe(1)
    expect(parseCustomerParams({ page: '2.9' }).page).toBe(2)
  })

  it('con parámetros repetidos usa el primero, y limita el largo de la búsqueda', () => {
    expect(parseCustomerParams({ q: ['uno', 'dos'], page: ['2', '5'] })).toMatchObject({ q: 'uno', page: 2 })
    expect(parseCustomerParams({ q: 'a'.repeat(500) }).q).toHaveLength(100)
  })
})

describe('toFilters', () => {
  it('omite la búsqueda vacía y conserva el estado', () => {
    expect(toFilters(defaults)).toEqual({ search: undefined, status: 'active' })
    expect(toFilters({ q: 'ana', status: 'all', page: 4 })).toEqual({ search: 'ana', status: 'all' })
  })
})

describe('buildCustomersQuery', () => {
  it('omite los valores por defecto', () => {
    expect(buildCustomersQuery(defaults)).toBe('')
    expect(buildCustomersQuery({})).toBe('')
    expect(buildCustomersQuery({ page: 1 })).toBe('')
  })

  it('serializa lo que no es por defecto y codifica los caracteres especiales', () => {
    expect(buildCustomersQuery({ q: 'a&b c', page: 2 })).toBe('?q=a%26b+c&page=2')
    expect(buildCustomersQuery({ status: 'archived' })).toBe('?status=archived')
  })
})

describe('hasActiveFilters', () => {
  it('detecta filtros distintos al valor por defecto; la página no cuenta', () => {
    expect(hasActiveFilters(defaults)).toBe(false)
    expect(hasActiveFilters({ ...defaults, page: 3 })).toBe(false)
    expect(hasActiveFilters({ ...defaults, q: 'ana' })).toBe(true)
    expect(hasActiveFilters({ ...defaults, status: 'all' })).toBe(true)
  })
})
