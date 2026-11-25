import { describe, expect, it } from 'vitest'
import { lastMonthRange, monthRange, resolvePeriod } from './reportPeriod'

const custom = (from: string, to: string) => ({ period: 'personalizado' as const, from, to })
const preset = (period: 'hoy' | '7d' | '30d' | 'mes' | 'mes-pasado' | 'anio') => ({ period, from: '', to: '' })

describe('resolvePeriod · atajos', () => {
  const today = '2026-11-23'
  it.each([
    ['hoy', { from: '2026-11-23', to: '2026-11-23' }],
    ['7d', { from: '2026-11-17', to: '2026-11-23' }], // 7 días contando hoy
    ['30d', { from: '2026-10-25', to: '2026-11-23' }],
    ['mes', { from: '2026-11-01', to: '2026-11-23' }],
    ['mes-pasado', { from: '2026-10-01', to: '2026-10-31' }],
    ['anio', { from: '2026-01-01', to: '2026-11-23' }],
  ] as const)('%s', (period, range) => {
    expect(resolvePeriod(preset(period), today)).toEqual({ range, error: null })
  })

  it('los atajos ignoran las fechas que haya en la URL', () => {
    expect(resolvePeriod({ period: 'hoy', from: '2020-01-01', to: '2020-12-31' }, today).range).toEqual({ from: today, to: today })
  })
})

describe('resolvePeriod · bordes de calendario', () => {
  it('7 y 30 días cruzan el mes y el año', () => {
    expect(resolvePeriod(preset('7d'), '2026-01-03').range).toEqual({ from: '2025-12-28', to: '2026-01-03' })
    expect(resolvePeriod(preset('30d'), '2026-03-01').range).toEqual({ from: '2026-01-31', to: '2026-03-01' })
  })
  it('el mes pasado de enero es diciembre del año anterior', () => {
    expect(lastMonthRange('2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
  it('el mes pasado respeta febrero normal y bisiesto', () => {
    expect(lastMonthRange('2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(lastMonthRange('2024-03-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
  it('el mes pasado de un mes de 31 días y de 30', () => {
    expect(lastMonthRange('2026-11-23')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(lastMonthRange('2026-12-05')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })
  it('el primer día del mes el rango es de un solo día', () => {
    expect(monthRange('2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-01' })
  })
  it('el año empieza el 1 de enero también en enero', () => {
    expect(resolvePeriod(preset('anio'), '2026-01-01').range).toEqual({ from: '2026-01-01', to: '2026-01-01' })
  })
})

describe('resolvePeriod · personalizado', () => {
  const today = '2026-11-23'
  it('un rango válido se usa tal cual', () => {
    expect(resolvePeriod(custom('2026-01-05', '2026-02-10'), today)).toEqual({ range: { from: '2026-01-05', to: '2026-02-10' }, error: null })
  })
  it('puede ser de un solo día', () => {
    expect(resolvePeriod(custom('2026-11-10', '2026-11-10'), today).error).toBeNull()
  })
  it('sin fechas pide elegirlas y mientras tanto da el mes en curso', () => {
    expect(resolvePeriod(custom('', ''), today)).toEqual({ range: monthRange(today), error: 'Elige la fecha de inicio y la de término' })
    expect(resolvePeriod(custom('2026-11-01', ''), today).error).toBe('Elige la fecha de inicio y la de término')
  })
  it('explica por qué un rango no vale', () => {
    expect(resolvePeriod(custom('2026-11-30', '2026-11-01'), today).error).toBe('La fecha de inicio no puede ser posterior a la de término')
    expect(resolvePeriod(custom('2026-02-30', '2026-03-01'), today).error).toBe('Las fechas deben ser reales, en formato AAAA-MM-DD')
    expect(resolvePeriod(custom('2025-01-01', '2026-01-02'), today).error).toBe('El rango máximo es de un año')
  })
  it('un rango inválido nunca llega a la consulta: cae en el mes en curso', () => {
    expect(resolvePeriod(custom('2026-11-30', '2026-11-01'), today).range).toEqual(monthRange(today))
  })
})
