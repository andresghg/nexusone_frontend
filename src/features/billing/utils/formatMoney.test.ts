import { describe, expect, it } from 'vitest'
import { currencyDefaultDecimals, formatMoney } from './formatMoney'

describe('formatMoney', () => {
  it('formatea con la moneda, el idioma y los decimales de la empresa', () => {
    expect(formatMoney(1190, { currency: 'CLP', locale: 'es-CL', decimals: 0 })).toBe('$1.190')
    expect(formatMoney(1190, { currency: 'USD', locale: 'en-US', decimals: 2 })).toBe('$1,190.00')
  })

  it('respeta los decimales pedidos aunque la moneda use otros', () => {
    expect(formatMoney(5.5, { currency: 'USD', locale: 'en-US', decimals: 0 })).toBe('$6')
    expect(formatMoney(5.5, { currency: 'CLP', locale: 'es-CL', decimals: 2 })).toBe('$5,50')
  })

  it('nunca lanza: con un idioma o una moneda incompletos muestra el número y el código', () => {
    expect(formatMoney(1.5, { currency: 'USD', locale: 'es C!', decimals: 2 })).toBe('1.50 USD')
    expect(formatMoney(1.5, { currency: 'US', locale: 'en-US', decimals: 2 })).toBe('1.50 US')
    expect(formatMoney(1.5, { currency: '', locale: 'en-US', decimals: 2 })).toBe('1.50')
  })

  it('con decimales fuera de rango usa 2', () => {
    expect(formatMoney(1.5, { currency: 'USD', locale: 'en-US', decimals: NaN })).toBe('$1.50')
    expect(formatMoney(1.5, { currency: 'USD', locale: 'en-US', decimals: 5 })).toBe('$1.50')
  })
})

describe('currencyDefaultDecimals', () => {
  it('devuelve los decimales habituales de la moneda', () => {
    expect(currencyDefaultDecimals('CLP')).toBe(0)
    expect(currencyDefaultDecimals('USD')).toBe(2)
    expect(currencyDefaultDecimals('usd')).toBe(2)
    expect(currencyDefaultDecimals('JPY')).toBe(0)
  })

  it('null si el código no es válido o necesita más de 2 decimales', () => {
    expect(currencyDefaultDecimals('')).toBeNull()
    expect(currencyDefaultDecimals('US')).toBeNull()
    expect(currencyDefaultDecimals('KWD')).toBeNull() // 3 decimales
  })
})
