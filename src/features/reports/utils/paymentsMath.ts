/** Cobro promedio, redondeado a los decimales de la moneda. 0 si no hubo cobros. */
export function averagePayment(total: number, payments: number, decimals: number): number {
  if (payments <= 0) return 0
  const factor = 10 ** decimals
  return Math.round((total / payments) * factor) / factor
}
