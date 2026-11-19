import { describe, expect, it } from 'vitest'
import { resolvePeriod } from './periods'

describe('resolvePeriod', () => {
  it('"all" no limita las fechas', () => {
    expect(resolvePeriod('all', '2026-11-10')).toEqual({})
  })

  it('hoy: el mismo día en ambos extremos', () => {
    expect(resolvePeriod('today', '2026-11-10')).toEqual({ from: '2026-11-10', to: '2026-11-10' })
  })

  it('últimos 7 días: contando hoy', () => {
    expect(resolvePeriod('week', '2026-11-10')).toEqual({ from: '2026-11-04', to: '2026-11-10' })
    expect(resolvePeriod('week', '2026-11-03')).toEqual({ from: '2026-10-28', to: '2026-11-03' }) // cruza de mes
  })

  it('este mes: desde el día 1 hasta hoy', () => {
    expect(resolvePeriod('month', '2026-11-10')).toEqual({ from: '2026-11-01', to: '2026-11-10' })
    expect(resolvePeriod('month', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-01' })
  })

  it('mes pasado: el mes calendario anterior completo', () => {
    expect(resolvePeriod('last_month', '2026-11-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(resolvePeriod('last_month', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(resolvePeriod('last_month', '2028-03-15')).toEqual({ from: '2028-02-01', to: '2028-02-29' }) // bisiesto
    expect(resolvePeriod('last_month', '2026-01-20')).toEqual({ from: '2025-12-01', to: '2025-12-31' }) // cruza de año
  })
})
