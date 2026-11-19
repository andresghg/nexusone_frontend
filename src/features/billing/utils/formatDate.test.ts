import { describe, expect, it } from 'vitest'
import { formatCalendarDate, formatIssuedDate } from './formatDate'

const cl = { locale: 'es-CL', timezone: 'America/Santiago' }

describe('formatIssuedDate', () => {
  it('muestra el día en la zona horaria de la empresa', () => {
    // 02:00 UTC del 10 es todavía el 9 en Santiago (23:00)
    expect(formatIssuedDate('2026-11-10T02:00:00.000Z', cl)).toMatch(/^09 nov\.? 2026$/)
    expect(formatIssuedDate('2026-11-10T15:00:00.000Z', cl)).toMatch(/^10 nov\.? 2026$/)
    expect(formatIssuedDate('2026-11-10T02:00:00.000Z', { ...cl, timezone: 'Asia/Tokyo' })).toMatch(/^10 nov\.? 2026$/)
  })

  it('respeta el idioma', () => {
    expect(formatIssuedDate('2026-11-10T15:00:00.000Z', { locale: 'en-US', timezone: 'America/New_York' })).toBe('Nov 10, 2026')
  })

  it('nunca lanza: con idioma o zona inválidos muestra la fecha ISO', () => {
    expect(formatIssuedDate('2026-11-10T15:00:00.000Z', { locale: 'es C!', timezone: 'America/Santiago' })).toBe('2026-11-10')
    expect(formatIssuedDate('2026-11-10T15:00:00.000Z', { locale: 'es-CL', timezone: 'Marte/Olimpo' })).toBe('2026-11-10')
  })
})

describe('formatCalendarDate', () => {
  it('una fecha de calendario no se desplaza por zonas horarias', () => {
    expect(formatCalendarDate('2026-12-10', 'es-CL')).toMatch(/^10 dic\.? 2026$/)
    expect(formatCalendarDate('2026-01-01', 'es-CL')).toMatch(/^01 ene\.? 2026$/)
  })

  it('nunca lanza', () => {
    expect(formatCalendarDate('2026-12-10', 'es C!')).toBe('2026-12-10')
  })
})
