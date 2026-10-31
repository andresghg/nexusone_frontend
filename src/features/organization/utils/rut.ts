export function cleanRut(rut: string) {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase()
}

export function isValidRut(rut: string) {
  const clean = cleanRut(rut)
  if (clean.length < 2) return false
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  if (!/^\d+$/.test(body)) return false

  let sum = 0
  let mul = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const rest = 11 - (sum % 11)
  const expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest)
  return dv === expected
}

export function formatRut(rut: string) {
  const clean = cleanRut(rut)
  if (clean.length < 2) return clean
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${body}-${clean.slice(-1)}`
}