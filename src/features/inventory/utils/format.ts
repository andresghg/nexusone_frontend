// Formatos de visualización (es-CL). Más adelante la moneda será un dato de la empresa.
const money = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
const quantity = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 })

export const formatMoney = (value: number) => money.format(value)
export const formatStock = (value: number) => quantity.format(value)

/** Fecha y hora en la zona de Chile (zona fija: evita desajustes al hidratar). */
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  })
