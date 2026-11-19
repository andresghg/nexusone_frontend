/**
 * Forma canónica de una identificación tributaria: sin puntos ni espacios y en mayúsculas
 * ("76.123.456-k" → "76123456-K"). Así dos maneras de escribir lo mismo no se duplican.
 * No valida el formato de ningún país: la empresa puede facturar a clientes de cualquiera.
 */
export const normalizeTaxId = (value: string) => value.replace(/[\s.]/g, '').toUpperCase()
