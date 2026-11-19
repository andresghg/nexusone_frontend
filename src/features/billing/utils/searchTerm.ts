export type NumberSearch = {
  prefix: string // en mayúsculas; '' si solo escribió el número
  number: number
}

/**
 * ¿Lo que se escribió parece un número de documento? "F-000012", "f 12", "#12" y "12" → número 12
 * (con prefijo "F", "F", "" y "" respectivamente). Letras opcionales, separador opcional y dígitos.
 * Si no lo parece (un nombre, un RUT con puntos), devuelve null.
 */
export function parseNumberSearch(term: string): NumberSearch | null {
  const match = term.trim().match(/^([A-Za-z]{0,5})[-\s#]*(\d{1,9})$/)
  if (!match) return null
  const number = Number(match[2])
  return number > 0 ? { prefix: match[1].toUpperCase(), number } : null
}
