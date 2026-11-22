import {
  CREDIT_NOTE_DEFAULT_PREFIX,
  DEFAULT_BILLING_SETTINGS,
  type AnyDocumentType,
  type DocumentPrefixes,
} from '../types/billing'

/** Número visible del documento: "F-000123". Un borrador aún no tiene número. */
/** El prefijo de un tipo de documento: el de la empresa o, si falta, el de fábrica. */
export function documentPrefix(prefixes: Partial<DocumentPrefixes>, type: AnyDocumentType): string {
  return type === 'credit_note'
    ? (prefixes.credit_note ?? CREDIT_NOTE_DEFAULT_PREFIX)
    : (prefixes[type] ?? DEFAULT_BILLING_SETTINGS.documentPrefixes[type])
}

export function formatDocumentNumber(
  prefixes: Partial<DocumentPrefixes>,
  type: AnyDocumentType,
  number: number | null,
  width = 6,
): string {
  if (number === null) return 'Borrador'
  const prefix = documentPrefix(prefixes, type)
  return `${prefix}-${String(number).padStart(width, '0')}`
}
