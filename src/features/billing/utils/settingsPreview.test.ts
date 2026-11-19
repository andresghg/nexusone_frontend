import { describe, expect, it } from 'vitest'
import { buildPreview, PREVIEW_PRICE } from './settingsPreview'

describe('buildPreview', () => {
  it('precio con impuesto incluido: el total es el precio y el impuesto sale de él', () => {
    expect(buildPreview({ pricesIncludeTax: true, currencyDecimals: 0, taxRate: 19 })).toEqual({
      price: PREVIEW_PRICE,
      gross: 10000,
      discount: 0,
      net: 8403,
      tax: 1597,
      total: 10000,
    })
  })

  it('precio sin impuesto: el impuesto se suma al precio', () => {
    expect(buildPreview({ pricesIncludeTax: false, currencyDecimals: 0, taxRate: 19 })).toMatchObject({
      net: 10000,
      tax: 1900,
      total: 11900,
    })
  })

  it('tasa 0%: sin impuesto en ninguno de los dos modos', () => {
    for (const pricesIncludeTax of [true, false]) {
      expect(buildPreview({ pricesIncludeTax, currencyDecimals: 0, taxRate: 0 })).toMatchObject({
        net: 10000,
        tax: 0,
        total: 10000,
      })
    }
  })

  it('con decimales en la moneda', () => {
    expect(buildPreview({ pricesIncludeTax: false, currencyDecimals: 2, taxRate: 10.5 })).toMatchObject({
      tax: 1050,
      total: 11050,
    })
  })

  it('devuelve null mientras los datos no son válidos', () => {
    expect(buildPreview({ pricesIncludeTax: true, currencyDecimals: 0, taxRate: NaN })).toBeNull()
    expect(buildPreview({ pricesIncludeTax: true, currencyDecimals: 0, taxRate: 150 })).toBeNull()
    expect(buildPreview({ pricesIncludeTax: true, currencyDecimals: 7, taxRate: 19 })).toBeNull()
  })
})
