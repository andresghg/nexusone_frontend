import { describe, expect, it } from 'vitest'
import {
  buildInvoicesQuery,
  hasActiveFilters,
  parseInvoiceParams,
  toFilters,
  type InvoicesQuery,
} from './invoiceParams'

const defaults: InvoicesQuery = { q: '', status: 'all', payment: 'all', type: 'all', period: 'all', page: 1 }

describe('parseInvoiceParams', () => {
  it('sin parámetros devuelve los valores por defecto', () => {
    expect(parseInvoiceParams({})).toEqual(defaults)
  })

  it('lee los parámetros válidos y recorta la búsqueda', () => {
    expect(
      parseInvoiceParams({ q: ' F-12 ', status: 'void', payment: 'overdue', type: 'receipt', period: 'last_month', page: '3' }),
    ).toEqual({ q: 'F-12', status: 'void', payment: 'overdue', type: 'receipt', period: 'last_month', page: 3 })
  })

  it('valores inválidos o manipulados caen al valor por defecto', () => {
    expect(parseInvoiceParams({ status: 'borrador', payment: 'x', type: 'boleta', period: 'año', page: '-4' })).toEqual(defaults)
    expect(parseInvoiceParams({ page: 'abc' }).page).toBe(1)
  })

  it('con parámetros repetidos usa el primero, y limita el largo de la búsqueda', () => {
    expect(parseInvoiceParams({ q: ['uno', 'dos'], status: ['issued', 'void'] })).toMatchObject({ q: 'uno', status: 'issued' })
    expect(parseInvoiceParams({ q: 'a'.repeat(500) }).q).toHaveLength(100)
  })
})

describe('toFilters', () => {
  it('traduce al lenguaje del servicio y omite la búsqueda vacía', () => {
    expect(toFilters(defaults)).toEqual({ search: undefined, status: 'all', payment: 'all', documentType: 'all', period: 'all' })
    expect(toFilters({ ...defaults, q: 'ana', type: 'invoice', page: 4 })).toMatchObject({ search: 'ana', documentType: 'invoice' })
  })
})

describe('buildInvoicesQuery', () => {
  it('omite los valores por defecto', () => {
    expect(buildInvoicesQuery({})).toBe('')
    expect(buildInvoicesQuery(defaults)).toBe('')
  })

  it('serializa lo que no es por defecto, en un orden estable, con la página al final', () => {
    expect(buildInvoicesQuery({ q: 'a&b', payment: 'unpaid', page: 2 })).toBe('?q=a%26b&payment=unpaid&page=2')
    expect(buildInvoicesQuery({ period: 'month', status: 'issued' })).toBe('?status=issued&period=month')
  })
})

describe('hasActiveFilters', () => {
  it('detecta filtros distintos al valor por defecto; la página no cuenta', () => {
    expect(hasActiveFilters(defaults)).toBe(false)
    expect(hasActiveFilters({ ...defaults, page: 3 })).toBe(false)
    expect(hasActiveFilters({ ...defaults, q: 'ana' })).toBe(true)
    expect(hasActiveFilters({ ...defaults, payment: 'paid' })).toBe(true)
    expect(hasActiveFilters({ ...defaults, period: 'today' })).toBe(true)
  })
})
