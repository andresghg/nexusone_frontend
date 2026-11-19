export type MoneyFormat = {
  currency: string // ISO 4217: 'CLP'
  locale: string // 'es-CL'
  decimals: number // 0–2
}

/**
 * Monto con el formato de la empresa. Nunca lanza: mientras alguien escribe una moneda o
 * un idioma a medias ("US", "es C"), Intl falla y se muestra un número simple con el código.
 */
export function formatMoney(value: number, { currency, locale, decimals }: MoneyFormat): string {
  const digits = Number.isInteger(decimals) && decimals >= 0 && decimals <= 2 ? decimals : 2
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  } catch {
    return `${value.toFixed(digits)} ${currency}`.trim()
  }
}

/** Decimales habituales de una moneda (CLP → 0, USD → 2). Null si no se conoce o supera los 2 que admite el sistema. */
export function currencyDefaultDecimals(currency: string): number | null {
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits
    return digits !== undefined && digits <= 2 ? digits : null
  } catch {
    return null
  }
}
