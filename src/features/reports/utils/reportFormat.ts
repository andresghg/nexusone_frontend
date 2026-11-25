import type { DisplayFormat } from '@/features/billing/types/billing'
import type { Granularity } from '../types/report'

// Etiquetas de fechas y cifras para los reportes, con el idioma de la empresa. Nunca lanzan.
// Los períodos son fechas de calendario (no instantes): se formatean en UTC para que ninguna zona las corra un día.

const FALLBACK_LOCALE = 'es-CL'

function format(locale: string, options: Intl.DateTimeFormatOptions, date: Date): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date)
  } catch {
    return new Intl.DateTimeFormat(FALLBACK_LOCALE, { ...options, timeZone: 'UTC' }).format(date)
  }
}

const toDate = (bucket: string) => new Date(bucket.length === 7 ? `${bucket}-01T00:00:00Z` : `${bucket}T00:00:00Z`)
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "lun, 23 nov 2026" o "Noviembre de 2026": para tablas y tooltips. */
export function bucketLabel(bucket: string, granularity: Granularity, locale: string): string {
  const date = toDate(bucket)
  return granularity === 'day'
    ? format(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, date)
    : capitalize(format(locale, { month: 'long', year: 'numeric' }, date))
}

/** "23 nov" o "nov 26": corto, para el eje del gráfico. */
export function bucketTick(bucket: string, granularity: Granularity, locale: string): string {
  const date = toDate(bucket)
  return granularity === 'day'
    ? format(locale, { day: 'numeric', month: 'short' }, date)
    : format(locale, { month: 'short', year: '2-digit' }, date)
}

/** Una fecha de calendario suelta (YYYY-MM-DD): "23 nov 2026". */
export const calendarDate = (value: string, locale: string) =>
  format(locale, { day: 'numeric', month: 'short', year: 'numeric' }, toDate(value))

/** Montos del eje del gráfico, abreviados: "1,2 M", "850 mil". */
export function compactMoney(value: number, display: Pick<DisplayFormat, 'locale'>): string {
  try {
    return new Intl.NumberFormat(display.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  } catch {
    return new Intl.NumberFormat(FALLBACK_LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  }
}

/** Porcentaje de una parte sobre el todo, sin decimales; 0 si no hay todo. */
export const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** "lunes, 23 de noviembre": el día en palabras, para el encabezado del panel. */
export const longDate = (value: string, locale: string) =>
  capitalize(format(locale, { weekday: 'long', day: 'numeric', month: 'long' }, toDate(value)))
