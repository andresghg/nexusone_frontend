import {
  buildTableQuery,
  hasActiveFilters as hasTableFilters,
  parseTableQuery,
  type QuerySpec,
  type TableQuery,
} from '@/lib/table-query'
import type { ProductStatus } from '../types/inventory'

// Filtros de la lista de inventario, descritos para el estado de tabla genérico (ver lib/table-query).
// Este archivo es seguro para el cliente: no importa nada de servidor.
export const PAGE_SIZE = 25

export const INVENTORY_QUERY_SPEC = {
  q: { kind: 'text', max: 100 },
  category: { kind: 'uuid' },
  status: { kind: 'enum', values: ['active', 'archived', 'all'], default: 'active' },
  low: { kind: 'flag' },
} as const satisfies QuerySpec

// La misma información, con tipos propios del módulo
export type InventoryQuery = {
  q: string
  category: string // uuid de la categoría, o '' para todas
  status: ProductStatus
  low: boolean
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

const DEFAULTS: InventoryQuery = { q: '', category: '', status: 'active', low: false, page: 1 }

export function parseInventoryParams(params: RawParams): InventoryQuery {
  const { filters, page } = parseTableQuery(params, INVENTORY_QUERY_SPEC)
  return {
    q: filters.q,
    category: filters.category,
    status: filters.status as ProductStatus,
    low: filters.low === '1',
    page,
  }
}

/** Puente al estado genérico de tabla (lo usan la barra de filtros y la paginación). */
export function toTableQuery(query: InventoryQuery): TableQuery {
  return {
    filters: { q: query.q, category: query.category, status: query.status, low: query.low ? '1' : '' },
    page: query.page,
  }
}

/** Filtros para el service/repository. */
export function toFilters(query: InventoryQuery) {
  return {
    search: query.q || undefined,
    categoryId: query.category || undefined,
    status: query.status,
    lowStock: query.low || undefined,
  }
}

/** '?q=cola&page=2'. Omite los valores por defecto. */
export function buildInventoryQuery(query: Partial<InventoryQuery>) {
  return buildTableQuery(toTableQuery({ ...DEFAULTS, ...query }), INVENTORY_QUERY_SPEC)
}

export const hasActiveFilters = (query: InventoryQuery) =>
  hasTableFilters(toTableQuery(query), INVENTORY_QUERY_SPEC)
