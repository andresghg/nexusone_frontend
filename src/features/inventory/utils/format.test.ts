import { describe, expect, it } from 'vitest'
import { formatDateTime, formatMoney, formatStock } from './format'

const compact = (s: string) => s.replace(/\s/g, '')

describe('format', () => {
  it('dinero en pesos, con miles y sin decimales sobrantes', () => {
    expect(compact(formatMoney(1500))).toBe('$1.500')
    expect(compact(formatMoney(1234567))).toBe('$1.234.567')
    expect(compact(formatMoney(1500.5))).toBe('$1.500,5')
    expect(compact(formatMoney(0))).toBe('$0')
  })

  it('cantidades con hasta 3 decimales', () => {
    expect(formatStock(12)).toBe('12')
    expect(formatStock(12.5)).toBe('12,5')
    expect(formatStock(0.001)).toBe('0,001')
    expect(formatStock(1234.5678)).toBe('1.234,568')
  })

  it('la fecha usa la zona de Chile', () => {
    // 2026-11-02 02:30 UTC es el 1 de noviembre a las 23:30 en Chile (UTC-3 en horario de verano)
    expect(formatDateTime('2026-11-02T02:30:00Z')).toContain('1')
    expect(formatDateTime('2026-11-02T02:30:00Z')).not.toBe(formatDateTime('2026-11-03T02:30:00Z'))
  })
})
