import { describe, expect, it } from 'vitest'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import { BillingSettingsSchema, UpdateBillingSettingsSchema } from './billingSettingsSchema'

const valid = () => structuredClone(DEFAULT_BILLING_SETTINGS)

const firstError = (input: unknown) => {
  const result = BillingSettingsSchema.safeParse(input)
  return result.success ? null : result.error.issues[0].message
}

describe('BillingSettingsSchema', () => {
  it('acepta la configuración por defecto', () => {
    expect(BillingSettingsSchema.safeParse(valid()).success).toBe(true)
  })

  it('normaliza moneda y prefijos a mayúsculas y recorta espacios', () => {
    const result = BillingSettingsSchema.safeParse({
      ...valid(),
      currency: ' usd ',
      taxName: '  VAT ',
      documentPrefixes: { invoice: ' fa ', receipt: 'rc', sales_note: 'nv', credit_note: ' cr ' },
    })
    expect(result.success && result.data).toMatchObject({
      currency: 'USD',
      taxName: 'VAT',
      documentPrefixes: { invoice: 'FA', receipt: 'RC', sales_note: 'NV', credit_note: 'CR' },
    })
  })

  it('moneda: exactamente 3 letras', () => {
    const msg = 'Usa el código de 3 letras de la moneda (ej. CLP, USD)'
    expect(firstError({ ...valid(), currency: 'PESO' })).toBe(msg)
    expect(firstError({ ...valid(), currency: 'C1P' })).toBe(msg)
    expect(firstError({ ...valid(), currency: '' })).toBe(msg)
  })

  it('decimales de la moneda: entero entre 0 y 2', () => {
    expect(firstError({ ...valid(), currencyDecimals: 3 })).toBe('Los decimales van de 0 a 2')
    expect(firstError({ ...valid(), currencyDecimals: -1 })).toBe('Los decimales van de 0 a 2')
    expect(firstError({ ...valid(), currencyDecimals: 1.5 })).toBe('Los decimales deben ser un número entero')
    expect(BillingSettingsSchema.safeParse({ ...valid(), currencyDecimals: 2 }).success).toBe(true)
  })

  it('idioma y zona horaria deben existir', () => {
    expect(firstError({ ...valid(), locale: 'es CL!' })).toBe('Idioma o región inválido (ej. es-CL)')
    expect(firstError({ ...valid(), timezone: 'Marte/Olimpo' })).toBe('Zona horaria inválida (ej. America/Santiago)')
    expect(
      BillingSettingsSchema.safeParse({ ...valid(), locale: 'en-US', timezone: 'America/New_York' }).success,
    ).toBe(true)
  })

  it('impuesto: nombre obligatorio y tasa entre 0 y 100 con 2 decimales', () => {
    expect(firstError({ ...valid(), taxName: '  ' })).toBe('Indica el nombre del impuesto')
    expect(firstError({ ...valid(), taxRate: -1 })).toBe('La tasa no puede ser negativa')
    expect(firstError({ ...valid(), taxRate: 101 })).toBe('La tasa no puede superar 100%')
    expect(firstError({ ...valid(), taxRate: 19.999 })).toBe('La tasa admite máximo 2 decimales')
    expect(BillingSettingsSchema.safeParse({ ...valid(), taxRate: 0 }).success).toBe(true)
    expect(BillingSettingsSchema.safeParse({ ...valid(), taxRate: 10.5 }).success).toBe(true)
  })

  it('días de plazo: entero entre 0 y 365', () => {
    expect(firstError({ ...valid(), defaultDueDays: -1 })).toBe('Los días de plazo no pueden ser negativos')
    expect(firstError({ ...valid(), defaultDueDays: 366 })).toBe('Máximo 365 días')
    expect(firstError({ ...valid(), defaultDueDays: 30.5 })).toBe('Los días de plazo deben ser un número entero')
  })

  it('prefijos: 1 a 5 letras o números, y distintos entre sí', () => {
    const withPrefixes = (documentPrefixes: object) => ({ ...valid(), documentPrefixes })
    expect(firstError(withPrefixes({ invoice: '', receipt: 'R', sales_note: 'NV', credit_note: 'NC' }))).toBe(
      'El prefijo usa de 1 a 5 letras o números',
    )
    expect(firstError(withPrefixes({ invoice: 'ABCDEF', receipt: 'R', sales_note: 'NV', credit_note: 'NC' }))).toBe(
      'El prefijo usa de 1 a 5 letras o números',
    )
    expect(firstError(withPrefixes({ invoice: 'F-1', receipt: 'R', sales_note: 'NV', credit_note: 'NC' }))).toBe(
      'El prefijo usa de 1 a 5 letras o números',
    )
    expect(firstError(withPrefixes({ invoice: 'F', receipt: 'f', sales_note: 'NV', credit_note: 'NC' }))).toBe(
      'Los prefijos de cada tipo de documento deben ser distintos',
    )
  })

  it('la nota de crédito necesita su propio prefijo, distinto de los demás', () => {
    const withPrefixes = (documentPrefixes: object) => ({ ...valid(), documentPrefixes })
    // falta el prefijo
    expect(BillingSettingsSchema.safeParse(withPrefixes({ invoice: 'F', receipt: 'R', sales_note: 'NV' })).success).toBe(false)
    // igual al de otro tipo
    expect(firstError(withPrefixes({ invoice: 'F', receipt: 'R', sales_note: 'NV', credit_note: 'f' }))).toBe(
      'Los prefijos de cada tipo de documento deben ser distintos',
    )
    // mismo formato que los demás
    expect(firstError(withPrefixes({ invoice: 'F', receipt: 'R', sales_note: 'NV', credit_note: 'N-C' }))).toBe(
      'El prefijo usa de 1 a 5 letras o números',
    )
    expect(BillingSettingsSchema.safeParse(withPrefixes({ invoice: 'F', receipt: 'R', sales_note: 'NV', credit_note: 'NC' })).success).toBe(true)
  })

  it('los booleanos son obligatorios', () => {
    const { pricesIncludeTax: _a, ...sinPrecios } = valid()
    expect(BillingSettingsSchema.safeParse(sinPrecios).success).toBe(false)
  })
})

describe('UpdateBillingSettingsSchema', () => {
  it('exige una empresa válida', () => {
    expect(UpdateBillingSettingsSchema.safeParse({ ...valid(), organizationId: 'x' }).success).toBe(false)
    expect(
      UpdateBillingSettingsSchema.safeParse({
        ...valid(),
        organizationId: '3f2b6f6e-8c1d-4a4e-9a55-0d3a1a6c2b10',
      }).success,
    ).toBe(true)
  })
})
