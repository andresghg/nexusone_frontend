import { addDays } from '@/features/billing/utils/dates'
import type { DateRange } from '../types/report'
import type { ReportsQuery } from './reportParams'
import { rangeError } from './reportRange'

// Del período elegido en pantalla al rango de fechas que consultan los reportes. "Hoy" es el de la empresa.

const pad = (value: number) => String(value).padStart(2, '0')
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate() // month: 1-12

export function monthRange(today: string): DateRange {
  return { from: `${today.slice(0, 7)}-01`, to: today }
}

export function lastMonthRange(today: string): DateRange {
  let year = Number(today.slice(0, 4))
  let month = Number(today.slice(5, 7)) - 1
  if (month === 0) {
    month = 12
    year -= 1
  }
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}` }
}

/**
 * El rango del período elegido. Con un período personalizado inválido (fechas que faltan, que no existen, al revés
 * o de más de un año) devuelve el motivo en `error` y, mientras tanto, el mes en curso para que la pantalla no quede vacía.
 */
export function resolvePeriod(
  query: Pick<ReportsQuery, 'period' | 'from' | 'to'>,
  today: string,
): { range: DateRange; error: string | null } {
  switch (query.period) {
    case 'hoy':
      return { range: { from: today, to: today }, error: null }
    case '7d':
      return { range: { from: addDays(today, -6), to: today }, error: null }
    case '30d':
      return { range: { from: addDays(today, -29), to: today }, error: null }
    case 'mes':
      return { range: monthRange(today), error: null }
    case 'mes-pasado':
      return { range: lastMonthRange(today), error: null }
    case 'anio':
      return { range: { from: `${today.slice(0, 4)}-01-01`, to: today }, error: null }
    case 'personalizado': {
      if (!query.from || !query.to) return { range: monthRange(today), error: 'Elige la fecha de inicio y la de término' }
      const range = { from: query.from, to: query.to }
      const error = rangeError(range)
      return error ? { range: monthRange(today), error } : { range, error: null }
    }
  }
}
