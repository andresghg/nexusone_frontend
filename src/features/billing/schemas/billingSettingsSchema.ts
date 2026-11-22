import z from 'zod'
import { DOCUMENT_TYPES } from '../types/billing'

const isLocale = (value: string) => {
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

const isTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const prefix = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,5}$/, { error: 'El prefijo usa de 1 a 5 letras o números' })

export const BillingSettingsSchema = z.object({
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: 'Usa el código de 3 letras de la moneda (ej. CLP, USD)' }),
  currencyDecimals: z
    .number({ error: 'Los decimales deben ser un número' })
    .int({ error: 'Los decimales deben ser un número entero' })
    .min(0, { error: 'Los decimales van de 0 a 2' })
    .max(2, { error: 'Los decimales van de 0 a 2' }),
  locale: z.string().trim().refine(isLocale, { error: 'Idioma o región inválido (ej. es-CL)' }),
  timezone: z.string().trim().refine(isTimezone, { error: 'Zona horaria inválida (ej. America/Santiago)' }),
  taxName: z
    .string()
    .trim()
    .min(1, { error: 'Indica el nombre del impuesto' })
    .max(20, { error: 'Máximo 20 caracteres' }),
  taxRate: z
    .number({ error: 'La tasa debe ser un número' })
    .min(0, { error: 'La tasa no puede ser negativa' })
    .max(100, { error: 'La tasa no puede superar 100%' })
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      error: 'La tasa admite máximo 2 decimales',
    }),
  pricesIncludeTax: z.boolean(),
  allowNegativeStock: z.boolean(),
  defaultDueDays: z
    .number({ error: 'Los días de plazo deben ser un número' })
    .int({ error: 'Los días de plazo deben ser un número entero' })
    .min(0, { error: 'Los días de plazo no pueden ser negativos' })
    .max(365, { error: 'Máximo 365 días' }),
  documentPrefixes: z
    .object({ invoice: prefix, receipt: prefix, sales_note: prefix, credit_note: prefix })
    // Cada tipo, notas de crédito incluidas, necesita un prefijo propio: si dos coinciden, dos documentos
    // distintos podrían llamarse igual
    .refine((p) => new Set(Object.values(p)).size === DOCUMENT_TYPES.length + 1, {
      error: 'Los prefijos de cada tipo de documento deben ser distintos',
    }),
})

export const UpdateBillingSettingsSchema = BillingSettingsSchema.extend({
  organizationId: z.uuid({ error: 'Empresa inválida' }),
})

export type BillingSettingsFormValues = z.infer<typeof BillingSettingsSchema>
export type UpdateBillingSettingsInput = z.infer<typeof UpdateBillingSettingsSchema>
