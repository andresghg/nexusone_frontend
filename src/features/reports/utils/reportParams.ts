import {
  buildTableQuery,
  hasActiveFilters as hasTableFilters,
  parseTableQuery,
  type QuerySpec,
  type TableQuery,
} from '@/lib/table-query'

// Estado de la pantalla de reportes guardado en la URL (se puede recargar, compartir y usar "atrás").
// Seguro para el cliente: no importa nada de servidor.

export const REPORT_TABS = ['ventas', 'productos', 'cobros', 'cobrar'] as const
export type ReportTab = (typeof REPORT_TABS)[number]

export const REPORT_TAB_LABELS: Record<ReportTab, string> = {
  ventas: 'Ventas',
  productos: 'Productos',
  cobros: 'Cobros',
  cobrar: 'Por cobrar',
}

export const REPORT_PERIODS = ['hoy', '7d', '30d', 'mes', 'mes-pasado', 'anio', 'personalizado'] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  hoy: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  mes: 'Este mes',
  'mes-pasado': 'Mes pasado',
  anio: 'Este año',
  personalizado: 'Personalizado',
}

export const REPORT_RANKS = ['importe', 'cantidad'] as const
export type ReportRankParam = (typeof REPORT_RANKS)[number]

export const REPORTS_QUERY_SPEC = {
  tab: { kind: 'enum', values: REPORT_TABS, default: 'ventas' },
  periodo: { kind: 'enum', values: REPORT_PERIODS, default: 'mes' },
  desde: { kind: 'text', max: 10 },
  hasta: { kind: 'text', max: 10 },
  orden: { kind: 'enum', values: REPORT_RANKS, default: 'importe' },
} as const satisfies QuerySpec

export type ReportsQuery = {
  tab: ReportTab
  period: ReportPeriod
  from: string // solo con período personalizado
  to: string
  rank: ReportRankParam
}

const DEFAULTS: ReportsQuery = { tab: 'ventas', period: 'mes', from: '', to: '', rank: 'importe' }

type RawParams = Record<string, string | string[] | undefined>

/** La URL es entrada del usuario: todo valor inválido cae a su valor por defecto. */
export function parseReportParams(params: RawParams): ReportsQuery {
  const { filters } = parseTableQuery(params, REPORTS_QUERY_SPEC)
  return {
    tab: filters.tab as ReportTab,
    period: filters.periodo as ReportPeriod,
    from: filters.desde,
    to: filters.hasta,
    rank: filters.orden as ReportRankParam,
  }
}

const toTableQuery = (query: ReportsQuery): TableQuery => ({
  filters: { tab: query.tab, periodo: query.period, desde: query.from, hasta: query.to, orden: query.rank },
  page: 1,
})

/** '?tab=productos&periodo=30d'. Omite los valores por defecto; las fechas solo viajan con el período personalizado. */
export function buildReportsQuery(patch: Partial<ReportsQuery>): string {
  const query = { ...DEFAULTS, ...patch }
  if (query.period !== 'personalizado') query.from = query.to = ''
  return buildTableQuery(toTableQuery(query), REPORTS_QUERY_SPEC)
}

export const hasActiveFilters = (query: ReportsQuery) => hasTableFilters(toTableQuery(query), REPORTS_QUERY_SPEC)
