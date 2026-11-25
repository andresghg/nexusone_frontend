import { describe, expect, it } from 'vitest'
import { bucketsBetween, granularityFor, MAX_DAILY_DAYS, MAX_RANGE_DAYS, rangeDays, rangeError } from './reportRange'

describe('rangeDays', () => {
  it('cuenta ambos extremos', () => {
    expect(rangeDays({ from: '2026-11-01', to: '2026-11-01' })).toBe(1)
    expect(rangeDays({ from: '2026-11-01', to: '2026-11-30' })).toBe(30)
    expect(rangeDays({ from: '2026-02-01', to: '2026-02-28' })).toBe(28)
  })
  it('no se confunde con el cambio de hora ni con años bisiestos', () => {
    expect(rangeDays({ from: '2026-03-01', to: '2026-04-30' })).toBe(61)
    expect(rangeDays({ from: '2024-02-01', to: '2024-02-29' })).toBe(29)
    expect(rangeDays({ from: '2025-01-01', to: '2025-12-31' })).toBe(365)
  })
})

describe('rangeError', () => {
  it('un rango normal es válido', () => {
    expect(rangeError({ from: '2026-11-01', to: '2026-11-23' })).toBeNull()
    expect(rangeError({ from: '2026-11-23', to: '2026-11-23' })).toBeNull()
  })
  it('fechas inexistentes o mal escritas', () => {
    const message = 'Las fechas deben ser reales, en formato AAAA-MM-DD'
    expect(rangeError({ from: '2026-02-30', to: '2026-03-01' })).toBe(message)
    expect(rangeError({ from: '2026-11-01', to: '23-11-2026' })).toBe(message)
    expect(rangeError({ from: '', to: '2026-11-01' })).toBe(message)
    expect(rangeError({ from: '2026-13-01', to: '2026-13-02' })).toBe(message)
  })
  it('inicio posterior al término', () => {
    expect(rangeError({ from: '2026-11-24', to: '2026-11-23' })).toBe('La fecha de inicio no puede ser posterior a la de término')
  })
  it('máximo un año (366 días)', () => {
    expect(rangeError({ from: '2024-01-01', to: '2024-12-31' })).toBeNull() // año bisiesto: 366 días
    expect(rangeDays({ from: '2024-01-01', to: '2024-12-31' })).toBe(MAX_RANGE_DAYS)
    expect(rangeDays({ from: '2025-01-01', to: '2026-01-01' })).toBe(366)
    expect(rangeError({ from: '2025-01-01', to: '2026-01-01' })).toBeNull() // justo en el máximo
    expect(rangeError({ from: '2025-01-01', to: '2026-01-02' })).toBe('El rango máximo es de un año') // 367 días
  })
})

describe('granularityFor', () => {
  it('hasta 62 días por día; más, por mes', () => {
    expect(granularityFor({ from: '2026-11-01', to: '2026-11-01' })).toBe('day')
    expect(rangeDays({ from: '2026-01-01', to: '2026-03-03' })).toBe(MAX_DAILY_DAYS)
    expect(granularityFor({ from: '2026-01-01', to: '2026-03-03' })).toBe('day')
    expect(granularityFor({ from: '2026-01-01', to: '2026-03-04' })).toBe('month')
    expect(granularityFor({ from: '2025-11-24', to: '2026-11-23' })).toBe('month')
  })
})

describe('bucketsBetween', () => {
  it('días: todos, también el primero y el último', () => {
    expect(bucketsBetween({ from: '2026-11-29', to: '2026-12-02' }, 'day')).toEqual([
      '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02',
    ])
    expect(bucketsBetween({ from: '2026-11-01', to: '2026-11-01' }, 'day')).toEqual(['2026-11-01'])
  })
  it('días: febrero bisiesto y no bisiesto', () => {
    expect(bucketsBetween({ from: '2024-02-28', to: '2024-03-01' }, 'day')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
    expect(bucketsBetween({ from: '2026-02-28', to: '2026-03-01' }, 'day')).toEqual(['2026-02-28', '2026-03-01'])
  })
  it('meses: del mes de inicio al de término, cruzando el año', () => {
    expect(bucketsBetween({ from: '2025-11-15', to: '2026-02-03' }, 'month')).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02',
    ])
    expect(bucketsBetween({ from: '2026-11-15', to: '2026-11-20' }, 'month')).toEqual(['2026-11'])
  })
  it('un año completo son 12 o 13 meses según dónde empiece', () => {
    expect(bucketsBetween({ from: '2026-01-01', to: '2026-12-31' }, 'month')).toHaveLength(12)
    expect(bucketsBetween({ from: '2025-11-24', to: '2026-11-23' }, 'month')).toHaveLength(13)
  })
})
