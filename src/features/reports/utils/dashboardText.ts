// Frases del panel de inicio. Puras: reciben los números y devuelven el texto.

/** Cómo van las ventas de hoy frente a las de ayer, en una frase que no engaña cuando ayer no hubo nada que comparar. */
export function compareToYesterday(today: number, yesterday: number, money: (value: number) => string): string {
  if (today === 0 && yesterday === 0) return 'Todavía sin ventas hoy'
  if (yesterday === 0) return 'Ayer no hubo ventas'
  // Si ayer cerró en negativo (más devoluciones que ventas) un porcentaje no significa nada: se muestra el monto
  if (yesterday < 0) return `Ayer: ${money(yesterday)}`
  const percent = Math.round(((today - yesterday) / yesterday) * 100)
  if (percent === 0) return `Igual que ayer (${money(yesterday)})`
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)} % vs. ayer (${money(yesterday)})`
}

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
