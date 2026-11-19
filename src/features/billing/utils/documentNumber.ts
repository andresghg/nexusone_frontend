import {
  DEFAULT_BILLING_SETTINGS,
  type DocumentPrefixes,
  type DocumentType,
} from '../types/billing'

/** Número visible del documento: "F-000123". Un borrador aún no tiene número. */
export function formatDocumentNumber(
  prefixes: Partial<DocumentPrefixes>,
  type: DocumentType,
  number: number | null,
  width = 6,
): string {
  if (number === null) return 'Borrador'
  const prefix = prefixes[type] ?? DEFAULT_BILLING_SETTINGS.documentPrefixes[type]
  return `${prefix}-${String(number).padStart(width, '0')}`
}
