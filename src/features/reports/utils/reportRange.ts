import { addDays, isValidDate } from '@/features/billing/utils/dates'
import type { DateRange, Granularity } from '../types/report'

export const MAX_RANGE_DAYS = 366 // un año
export const MAX_DAILY_DAYS = 62 // hasta dos meses se grafica por día; más, por mes

/** Días del rango contando ambos extremos. */
export function rangeDays({ from, to }: DateRange): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1
}

/** Error legible del rango pedido, o null si es válido. */
export function rangeError({ from, to }: DateRange): string | null {
  if (!isValidDate(from) || !isValidDate(to)) return 'Las fechas deben ser reales, en formato AAAA-MM-DD'
  if (from > to) return 'La fecha de inicio no puede ser posterior a la de término'
  if (rangeDays({ from, to }) > MAX_RANGE_DAYS) return 'El rango máximo es de un año'
  return null
}

export const granularityFor = (range: DateRange): Granularity =>
  rangeDays(range) <= MAX_DAILY_DAYS ? 'day' : 'month'

/** Todos los períodos entre from y to (también los sin ventas), para que el gráfico no tenga huecos. */
export function bucketsBetween(range: DateRange, granularity: Granularity): string[] {
  const buckets: string[] = []
  if (granularity === 'day') {
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) buckets.push(day)
    return buckets
  }
  let [year, month] = range.from.split('-').map(Number)
  const [lastYear, lastMonth] = range.to.split('-').map(Number)
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    buckets.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return buckets
}
