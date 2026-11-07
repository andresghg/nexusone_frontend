// Las cantidades tienen hasta 3 decimales. Se operan en milésimas (enteros) para evitar
// errores de coma flotante: 0.1 + 0.2 en milésimas es 100 + 200 = 300, exacto.
export const toMilli = (value: number | string) => Math.round(Number(value) * 1000)

/** Milésimas → texto con 3 decimales, listo para una columna numeric(14,3). */
export const fromMilli = (milli: number) => (milli / 1000).toFixed(3)

export const milliToNumber = (milli: number) => milli / 1000

/** Para mensajes: 5.5 → "5.5", 12 → "12". */
export const formatQuantity = (milli: number) => String(Number(milliToNumber(milli).toFixed(3)))
