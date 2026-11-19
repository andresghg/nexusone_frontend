import {
  buildTableQuery,
  hasActiveFilters as hasTableFilters,
  parseTableQuery,
  type QuerySpec,
  type TableQuery,
} from '@/lib/table-query'
import { DOCUMENT_TYPES } from '../types/billing'
import type {
  DocumentTypeFilter,
  InvoiceListFilters,
  InvoicePeriod,
  InvoiceStatusFilter,
  PaymentFilter,
} from '../types/invoice'
import { INVOICE_PERIODS } from './periods'

// Filtros de la lista de documentos, descritos para el estado de tabla genérico (ver lib/table-query).
// Este archivo es seguro para el cliente: no importa nada de servidor.
export const PAGE_SIZE = 25

export const INVOICES_QUERY_SPEC = {
  q: { kind: 'text', max: 100 },
  status: { kind: 'enum', values: ['all', 'issued', 'void'], default: 'all' },
  payment: { kind: 'enum', values: ['all', 'unpaid', 'partial', 'paid', 'overdue'], default: 'all' },
  type: { kind: 'enum', values: ['all', ...DOCUMENT_TYPES], default: 'all' },
  period: { kind: 'enum', values: INVOICE_PERIODS, default: 'all' },
} as const satisfies QuerySpec

export type InvoicesQuery = {
  q: string
  status: InvoiceStatusFilter
  payment: PaymentFilter
  type: DocumentTypeFilter
  period: InvoicePeriod
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

const DEFAULTS: InvoicesQuery = { q: '', status: 'all', payment: 'all', type: 'all', period: 'all', page: 1 }

export function parseInvoiceParams(params: RawParams): InvoicesQuery {
  const { filters, page } = parseTableQuery(params, INVOICES_QUERY_SPEC)
  return {
    q: filters.q,
    status: filters.status as InvoiceStatusFilter,
    payment: filters.payment as PaymentFilter,
    type: filters.type as DocumentTypeFilter,
    period: filters.period as InvoicePeriod,
    page,
  }
}

/** Puente al estado genérico de tabla (lo usan la barra de filtros y la paginación). */
export function toTableQuery(query: InvoicesQuery): TableQuery {
  return {
    filters: { q: query.q, status: query.status, payment: query.payment, type: query.type, period: query.period },
    page: query.page,
  }
}

/** Filtros para el service. */
export function toFilters(query: InvoicesQuery): InvoiceListFilters {
  return {
    search: query.q || undefined,
    status: query.status,
    payment: query.payment,
    documentType: query.type,
    period: query.period,
  }
}

/** '?q=ana&page=2'. Omite los valores por defecto. */
export function buildInvoicesQuery(query: Partial<InvoicesQuery>) {
  return buildTableQuery(toTableQuery({ ...DEFAULTS, ...query }), INVOICES_QUERY_SPEC)
}

export const hasActiveFilters = (query: InvoicesQuery) =>
  hasTableFilters(toTableQuery(query), INVOICES_QUERY_SPEC)
