import {
  buildTableQuery,
  hasActiveFilters as hasTableFilters,
  parseTableQuery,
  type QuerySpec,
  type TableQuery,
} from '@/lib/table-query'
import type { CustomerStatus } from '../types/customers'

// Filtros de la lista de clientes, descritos para el estado de tabla genérico (ver lib/table-query).
// Este archivo es seguro para el cliente: no importa nada de servidor.
export const PAGE_SIZE = 25

export const CUSTOMERS_QUERY_SPEC = {
  q: { kind: 'text', max: 100 },
  status: { kind: 'enum', values: ['active', 'archived', 'all'], default: 'active' },
} as const satisfies QuerySpec

export type CustomersQuery = {
  q: string
  status: CustomerStatus
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

const DEFAULTS: CustomersQuery = { q: '', status: 'active', page: 1 }

export function parseCustomerParams(params: RawParams): CustomersQuery {
  const { filters, page } = parseTableQuery(params, CUSTOMERS_QUERY_SPEC)
  return { q: filters.q, status: filters.status as CustomerStatus, page }
}

/** Puente al estado genérico de tabla (lo usan la barra de filtros y la paginación). */
export function toTableQuery(query: CustomersQuery): TableQuery {
  return { filters: { q: query.q, status: query.status }, page: query.page }
}

/** Filtros para el service/repository. */
export function toFilters(query: CustomersQuery) {
  return { search: query.q || undefined, status: query.status }
}

/** '?q=ana&page=2'. Omite los valores por defecto. */
export function buildCustomersQuery(query: Partial<CustomersQuery>) {
  return buildTableQuery(toTableQuery({ ...DEFAULTS, ...query }), CUSTOMERS_QUERY_SPEC)
}

export const hasActiveFilters = (query: CustomersQuery) =>
  hasTableFilters(toTableQuery(query), CUSTOMERS_QUERY_SPEC)
