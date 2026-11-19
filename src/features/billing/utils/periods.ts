import { addDays } from './dates'
import type { InvoicePeriod } from '../types/invoice'

export const INVOICE_PERIODS = ['all', 'today', 'week', 'month', 'last_month'] as const

/**
 * Un período del filtro → rango de fechas de calendario (ambas inclusive), a partir de "hoy"
 * en la zona horaria de la empresa. 'all' no limita.
 *  - week: los últimos 7 días contando hoy.
 *  - month: desde el día 1 del mes en curso hasta hoy.
 *  - last_month: el mes calendario anterior completo.
 */
export function resolvePeriod(period: InvoicePeriod, today: string): { from?: string; to?: string } {
  switch (period) {
    case 'today':
      return { from: today, to: today }
    case 'week':
      return { from: addDays(today, -6), to: today }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'last_month': {
      const to = addDays(`${today.slice(0, 7)}-01`, -1) // último día del mes anterior
      return { from: `${to.slice(0, 7)}-01`, to }
    }
    default:
      return {}
  }
}
