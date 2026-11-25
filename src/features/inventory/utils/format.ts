import { DEFAULT_DISPLAY_FORMAT, type DisplayFormat } from '@/features/billing/types/billing'
import { formatMoney } from '@/features/billing/utils/formatMoney'

// Formatos de visualización con la moneda, el idioma y la zona horaria de la empresa (los mismos de facturación).
// Nunca lanzan: si el idioma o la zona horaria guardados no se entienden, se usan los de fábrica.

export type { DisplayFormat }

const FALLBACK = DEFAULT_DISPLAY_FORMAT

const quantityFormats = new Map<string, Intl.NumberFormat>()
function quantityFormat(locale: string): Intl.NumberFormat {
  let format = quantityFormats.get(locale)
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 })
    } catch {
      format = new Intl.NumberFormat(FALLBACK.locale, { maximumFractionDigits: 3 })
    }
    quantityFormats.set(locale, format)
  }
  return format
}

/**
 * Precio de un producto. Usa los decimales de la moneda de la empresa, salvo que el precio traiga centavos que esa
 * moneda no usa (un precio de 1.500,50 en pesos): entonces se muestran, para no esconder el dato.
 */
export function formatPrice(value: number, display: DisplayFormat): string {
  const scaled = Number((value * 10 ** display.currencyDecimals).toPrecision(12))
  const decimals = Number.isInteger(scaled) ? display.currencyDecimals : 2
  return formatMoney(value, { currency: display.currency, locale: display.locale, decimals })
}

/** Cantidades de stock: hasta 3 decimales, con el separador del idioma de la empresa. */
export const formatStock = (value: number, display: Pick<DisplayFormat, 'locale'>) =>
  quantityFormat(display.locale).format(value)

/** Fecha y hora en la zona de la empresa (zona explícita: evita desajustes entre servidor y navegador al hidratar). */
export function formatDateTime(iso: string, display: Pick<DisplayFormat, 'locale' | 'timezone'>): string {
  const date = new Date(iso)
  try {
    return date.toLocaleString(display.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: display.timezone })
  } catch {
    return date.toLocaleString(FALLBACK.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: FALLBACK.timezone })
  }
}
