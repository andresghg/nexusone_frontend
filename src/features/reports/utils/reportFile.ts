import type { DateRange } from '../types/report'
import type { ReportTab } from './reportParams'

// Nombres de archivo de los reportes descargados: solo ASCII y sin espacios, para que ningún sistema los corte.

const TAB_SLUG: Record<ReportTab, string> = { ventas: 'ventas', productos: 'productos', cobrar: 'por-cobrar' }

/** 'reporte-ventas_2026-11-01_2026-11-23.xlsx'. "Por cobrar" lleva solo la fecha de corte. */
export function reportFilename(tab: ReportTab, range: DateRange | null, asOf: string, extension: string): string {
  const when = tab === 'cobrar' || !range ? asOf : range.from === range.to ? range.from : `${range.from}_${range.to}`
  return `reporte-${TAB_SLUG[tab]}_${when}.${extension}`
}
