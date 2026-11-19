type DateFormat = { locale: string; timezone: string }

const OPTIONS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }

/** Fecha de un instante, en la zona horaria de la empresa. Nunca lanza: con un idioma o zona inválidos muestra la fecha ISO. */
export function formatIssuedDate(iso: string, { locale, timezone }: DateFormat): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...OPTIONS, timeZone: timezone }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/** Una fecha de calendario (YYYY-MM-DD, como el vencimiento) no se desplaza por zonas horarias. */
export function formatCalendarDate(date: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...OPTIONS, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  } catch {
    return date
  }
}
