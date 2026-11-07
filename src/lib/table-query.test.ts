import { describe, expect, it } from 'vitest'
import {
  buildTableQuery,
  hasActiveFilters,
  parseTableQuery,
  type QuerySpec,
  type TableQuery,
} from './table-query'

const UUID = '11111111-1111-4111-8111-111111111111'

const spec = {
  q: { kind: 'text', max: 10 },
  kind: { kind: 'uuid' },
  status: { kind: 'enum', values: ['open', 'closed', 'all'], default: 'open' },
  urgent: { kind: 'flag' },
} as const satisfies QuerySpec

const defaults: TableQuery = { filters: { q: '', kind: '', status: 'open', urgent: '' }, page: 1 }

describe('parseTableQuery', () => {
  it('sin parámetros devuelve los valores por defecto de cada campo', () => {
    expect(parseTableQuery({}, spec)).toEqual(defaults)
  })

  it('lee valores válidos de cada tipo', () => {
    expect(parseTableQuery({ q: ' hola ', kind: UUID, status: 'closed', urgent: '1', page: '3' }, spec)).toEqual({
      filters: { q: 'hola', kind: UUID, status: 'closed', urgent: '1' },
      page: 3,
    })
  })

  it('valores inválidos o manipulados caen al valor por defecto', () => {
    expect(parseTableQuery({ kind: "x' or 1=1", status: 'borrados', urgent: 'true', page: '-4' }, spec)).toEqual(defaults)
    expect(parseTableQuery({ page: 'abc' }, spec).page).toBe(1)
    expect(parseTableQuery({ page: '0' }, spec).page).toBe(1)
    expect(parseTableQuery({ page: '2.9' }, spec).page).toBe(2)
  })

  it('con parámetros repetidos usa el primero, y recorta el texto al máximo', () => {
    expect(parseTableQuery({ q: ['uno', 'dos'], page: ['2', '5'] }, spec)).toMatchObject({ filters: { q: 'uno' }, page: 2 })
    expect(parseTableQuery({ q: 'a'.repeat(50) }, spec).filters.q).toHaveLength(10)
  })

  it('el texto sin `max` se recorta a 100', () => {
    expect(parseTableQuery({ q: 'a'.repeat(500) }, { q: { kind: 'text' } }).filters.q).toHaveLength(100)
  })

  it('ignora los parámetros que no están en el spec', () => {
    expect(Object.keys(parseTableQuery({ q: 'x', otro: 'y' }, spec).filters)).toEqual(['q', 'kind', 'status', 'urgent'])
  })
})

describe('buildTableQuery', () => {
  it('omite los valores por defecto', () => {
    expect(buildTableQuery(defaults, spec)).toBe('')
  })

  it('serializa lo que no es por defecto, en el orden del spec, y codifica caracteres especiales', () => {
    expect(buildTableQuery({ filters: { ...defaults.filters, q: 'a&b c', urgent: '1' }, page: 2 }, spec)).toBe('?q=a%26b+c&urgent=1&page=2')
    expect(buildTableQuery({ filters: { ...defaults.filters, status: 'closed', kind: UUID }, page: 1 }, spec)).toBe(`?kind=${UUID}&status=closed`)
  })

  it('un filtro ausente cuenta como vacío', () => {
    expect(buildTableQuery({ filters: {}, page: 1 }, spec)).toBe('')
  })

  it('es el inverso de parseTableQuery', () => {
    const query: TableQuery = { filters: { q: 'coca & ', kind: UUID, status: 'all', urgent: '1' }, page: 7 }
    const params = Object.fromEntries(new URLSearchParams(buildTableQuery(query, spec)))
    expect(parseTableQuery(params, spec)).toEqual({ ...query, filters: { ...query.filters, q: 'coca &' } })
  })
})

describe('hasActiveFilters', () => {
  it('ignora la página y detecta cualquier filtro distinto del por defecto', () => {
    expect(hasActiveFilters({ ...defaults, page: 5 }, spec)).toBe(false)
    expect(hasActiveFilters({ ...defaults, filters: { ...defaults.filters, q: 'x' } }, spec)).toBe(true)
    expect(hasActiveFilters({ ...defaults, filters: { ...defaults.filters, urgent: '1' } }, spec)).toBe(true)
    expect(hasActiveFilters({ ...defaults, filters: { ...defaults.filters, status: 'all' } }, spec)).toBe(true)
    expect(hasActiveFilters({ ...defaults, filters: { ...defaults.filters, kind: UUID } }, spec)).toBe(true)
  })

  it('un enum en su valor por defecto no cuenta como filtro', () => {
    expect(hasActiveFilters({ filters: { status: 'open' }, page: 1 }, spec)).toBe(false)
    expect(hasActiveFilters({ filters: {}, page: 1 }, spec)).toBe(false)
  })
})
