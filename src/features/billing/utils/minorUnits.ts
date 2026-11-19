/**
 * Monto → unidades mínimas enteras de la moneda (CLP: pesos; USD: centavos), para comparar y
 * sumar sin errores de coma flotante. Null si no es un monto válido: negativo, no finito o con
 * más decimales de los que admite la moneda.
 */
export function toMinorUnits(amount: number, decimals: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null
  // toPrecision(15) absorbe el ruido de coma flotante (19.99 × 100 = 1998.9999999999998)
  const minor = Number((amount * 10 ** decimals).toPrecision(15))
  return Number.isInteger(minor) ? minor : null
}

export const fromMinorUnits = (minor: number, decimals: number) => minor / 10 ** decimals
