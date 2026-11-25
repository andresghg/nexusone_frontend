import { describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_FORMAT, type DisplayFormat } from '@/features/billing/types/billing'
import { formatDateTime, formatPrice, formatStock } from './format'

const compact = (s: string) => s.replace(/\s/g, '')
const clp = DEFAULT_DISPLAY_FORMAT
const usd: DisplayFormat = { currency: 'USD', currencyDecimals: 2, locale: 'en-US', timezone: 'America/New_York' }
const eur: DisplayFormat = { currency: 'EUR', currencyDecimals: 2, locale: 'de-DE', timezone: 'Europe/Berlin' }

describe('formatPrice', () => {
  it('pesos chilenos: miles con punto y sin decimales', () => {
    expect(compact(formatPrice(1500, clp))).toBe('$1.500')
    expect(compact(formatPrice(1234567, clp))).toBe('$1.234.567')
    expect(compact(formatPrice(0, clp))).toBe('$0')
  })

  it('usa la moneda, los decimales y el idioma de la empresa', () => {
    expect(formatPrice(1234.5, usd)).toBe('$1,234.50')
    expect(formatPrice(12, usd)).toBe('$12.00')
    expect(compact(formatPrice(1234.5, eur))).toBe('1.234,50€')
  })

  it('una moneda sin decimales no esconde los centavos que traiga el precio', () => {
    expect(compact(formatPrice(1500.5, clp))).toBe('$1.500,50')
    expect(compact(formatPrice(1500.25, clp))).toBe('$1.500,25')
  })

  it('un precio entero no gana decimales de más, ni con coma flotante rara', () => {
    expect(compact(formatPrice(1500.0, clp))).toBe('$1.500')
    expect(compact(formatPrice(0.1 + 0.2 + 1499.7, clp))).toBe('$1.500')
  })

  it('una moneda con 1 decimal', () => {
    expect(formatPrice(10.5, { ...usd, currencyDecimals: 1 })).toBe('$10.5')
    expect(formatPrice(10.55, { ...usd, currencyDecimals: 1 })).toBe('$10.55')
  })

  it('nunca lanza, aunque la moneda o el idioma guardados no se entiendan', () => {
    expect(() => formatPrice(10, { ...clp, currency: 'US' })).not.toThrow()
    expect(() => formatPrice(10, { ...clp, locale: 'es C' })).not.toThrow()
    expect(formatPrice(10, { ...clp, currency: 'US' })).toContain('US')
  })
})

describe('formatStock', () => {
  it('cantidades con hasta 3 decimales y el separador del idioma', () => {
    expect(formatStock(12, clp)).toBe('12')
    expect(formatStock(12.5, clp)).toBe('12,5')
    expect(formatStock(0.001, clp)).toBe('0,001')
    expect(formatStock(1234.5678, clp)).toBe('1.234,568')
    expect(formatStock(1234.5678, usd)).toBe('1,234.568')
    expect(formatStock(1234.5, eur)).toBe('1.234,5')
  })

  it('con un idioma inválido usa el de fábrica en vez de fallar', () => {
    expect(formatStock(1234.5, { locale: 'es C' })).toBe('1.234,5')
    expect(formatStock(1234.5, { locale: '' })).toBe('1.234,5')
  })
})

describe('formatDateTime', () => {
  const instant = '2026-11-02T02:30:00Z'

  it('respeta la zona horaria de la empresa: el mismo instante cae en días distintos', () => {
    // 02:30 UTC del 2 de noviembre: 23:30 del 1 en Chile (UTC-3), 21:30 del 1 en Nueva York, 03:30 del 2 en Berlín
    expect(formatDateTime(instant, clp)).toContain('1')
    expect(formatDateTime(instant, clp)).toMatch(/11:30\s?p\.\s?m\./) // es-CL usa reloj de 12 horas
    expect(formatDateTime(instant, usd)).toMatch(/9:30\s?PM/)
    expect(formatDateTime(instant, eur)).toMatch(/03:30/)
  })

  it('el idioma cambia el formato', () => {
    expect(formatDateTime(instant, clp)).not.toBe(formatDateTime(instant, usd))
    expect(formatDateTime(instant, usd)).toMatch(/Nov 1, 2026/)
  })

  it('días distintos dan textos distintos', () => {
    expect(formatDateTime(instant, clp)).not.toBe(formatDateTime('2026-11-03T02:30:00Z', clp))
  })

  it('una zona horaria inválida cae en la de fábrica (Chile) en vez de fallar', () => {
    expect(formatDateTime(instant, { locale: 'es-CL', timezone: 'Mars/Olympus' })).toBe(formatDateTime(instant, clp))
  })
})
