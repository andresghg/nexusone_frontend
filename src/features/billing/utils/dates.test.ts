import { describe, expect, it } from 'vitest'
import { addDays, isValidDate, todayInTimezone } from './dates'

describe('todayInTimezone', () => {
  const instant = new Date('2026-11-10T02:00:00Z')

  it('usa la zona horaria de la empresa, no la del servidor', () => {
    expect(todayInTimezone(instant, 'UTC')).toBe('2026-11-10')
    expect(todayInTimezone(instant, 'America/Santiago')).toBe('2026-11-09') // 23:00 del día anterior
    expect(todayInTimezone(instant, 'Asia/Tokyo')).toBe('2026-11-10') // 11:00
    expect(todayInTimezone(new Date('2026-11-10T20:00:00Z'), 'Asia/Tokyo')).toBe('2026-11-11')
  })

  it('formatea con ceros a la izquierda', () => {
    expect(todayInTimezone(new Date('2026-03-05T12:00:00Z'), 'UTC')).toBe('2026-03-05')
  })
})

describe('isValidDate', () => {
  it('acepta fechas reales', () => {
    expect(isValidDate('2026-02-28')).toBe(true)
    expect(isValidDate('2028-02-29')).toBe(true) // bisiesto
  })

  it('rechaza fechas que no existen o mal escritas', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2027-02-29')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('2026-00-10')).toBe(false)
    expect(isValidDate('2026-1-1')).toBe(false)
    expect(isValidDate('10/11/2026')).toBe(false)
    expect(isValidDate('')).toBe(false)
  })
})

describe('addDays', () => {
  it('suma días de calendario', () => {
    expect(addDays('2026-11-10', 30)).toBe('2026-12-10')
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04')
    expect(addDays('2026-11-10', 0)).toBe('2026-11-10')
  })

  it('respeta los años bisiestos y los días negativos', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
