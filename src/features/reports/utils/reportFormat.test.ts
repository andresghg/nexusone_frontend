import { describe, expect, it } from 'vitest'
import { bucketLabel, bucketTick, calendarDate, compactMoney, longDate, percentOf } from './reportFormat'

const n = (s: string) => s.replace(/\s/g, ' ')

describe('bucketLabel', () => {
  it('día: con el día de la semana, en el idioma de la empresa', () => {
    expect(n(bucketLabel('2026-11-23', 'day', 'es-CL'))).toMatch(/lun.*23.*nov.*2026/i)
    expect(n(bucketLabel('2026-11-23', 'day', 'en-US'))).toMatch(/Mon.*Nov 23.*2026/)
  })
  it('mes: nombre completo con la primera letra en mayúscula', () => {
    expect(bucketLabel('2026-11', 'month', 'es-CL')).toMatch(/^Noviembre.*2026$/)
    expect(bucketLabel('2026-11', 'month', 'en-US')).toBe('November 2026')
  })
  it('una fecha de calendario no se corre un día por la zona horaria', () => {
    // 1 de noviembre a las 00:00 UTC sería 31 de octubre en Chile si se formateara con la zona local
    expect(n(bucketLabel('2026-11-01', 'day', 'es-CL'))).toMatch(/1.*nov/i)
    expect(bucketLabel('2026-01-01', 'month', 'en-US')).toBe('January 2026')
  })
  it('con un idioma inválido cae en español en vez de fallar', () => {
    expect(() => bucketLabel('2026-11-23', 'day', 'es C')).not.toThrow()
    expect(n(bucketLabel('2026-11-23', 'day', 'es C'))).toMatch(/23.*nov/i)
  })
})

describe('bucketTick', () => {
  it('eje corto: día y mes, o mes y año', () => {
    expect(n(bucketTick('2026-11-23', 'day', 'es-CL'))).toMatch(/23.*nov/i)
    expect(n(bucketTick('2026-11', 'month', 'es-CL'))).toMatch(/nov.*26/i)
  })
})

describe('calendarDate', () => {
  it('fecha suelta', () => {
    expect(n(calendarDate('2026-10-01', 'es-CL'))).toMatch(/1.*oct.*2026/i)
  })
})

describe('compactMoney', () => {
  it('abrevia montos grandes', () => {
    expect(compactMoney(1_200_000, { locale: 'en-US' })).toBe('1.2M')
    expect(compactMoney(850, { locale: 'en-US' })).toBe('850')
    expect(n(compactMoney(1_200_000, { locale: 'es-CL' }))).toMatch(/1,2.*M/)
  })
  it('idioma inválido no rompe', () => {
    expect(() => compactMoney(1000, { locale: 'es C' })).not.toThrow()
  })
})

describe('percentOf', () => {
  it('porcentaje redondeado y sin dividir por cero', () => {
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(2, 3)).toBe(67)
    expect(percentOf(5, 0)).toBe(0)
    expect(percentOf(0, 100)).toBe(0)
  })
})

describe('longDate', () => {
  it('el día en palabras, con mayúscula inicial y sin correrse por la zona horaria', () => {
    expect(longDate('2026-11-23', 'es-CL')).toBe('Lunes, 23 de noviembre')
    expect(longDate('2026-11-01', 'es-CL')).toBe('Domingo, 1 de noviembre')
    expect(longDate('2026-11-23', 'en-US')).toBe('Monday, November 23')
  })
  it('con un idioma inválido cae en español', () => {
    expect(longDate('2026-11-23', 'es C')).toBe('Lunes, 23 de noviembre')
  })
})
