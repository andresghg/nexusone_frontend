import type { CategoryRow } from '../types/inventory'
import type { InventoryQuery } from './inventoryParams'

// Lógica del diálogo "Impuesto en lote", sin React.

export type TaxMode = 'exempt' | 'default' | 'custom'

const RATE = /^\d+([.,]\d{1,2})?$/

/** Lo que entiende el servicio: "0" = exento, vacío = tasa de la empresa, otro valor = esa tasa. */
export function taxRateInput(mode: TaxMode, custom: string): string {
  if (mode === 'exempt') return '0'
  if (mode === 'default') return ''
  return custom.trim()
}

/** Error de la tasa escrita a mano, o null si es válida. Vacío no vale: "tasa de la empresa" es otra opción. */
export function customRateError(text: string): string | null {
  const value = text.trim()
  if (value === '') return 'Escribe la tasa de impuesto'
  if (!RATE.test(value) || Number(value.replace(',', '.')) > 100) {
    return 'Debe ser un número entre 0 y 100, con máximo 2 decimales'
  }
  return null
}

/** El efecto del cambio, dicho con el total: se usa como texto del botón para que nadie confirme a ciegas. */
export function applyLabel(mode: TaxMode, custom: string, count: number): string {
  const noun = `${count} producto${count === 1 ? '' : 's'}`
  if (mode === 'exempt') return `Dejar ${noun} exento${count === 1 ? '' : 's'}`
  if (mode === 'default') return `Aplicar la tasa de la empresa a ${noun}`
  return `Aplicar ${custom.trim().replace('.', ',')} % a ${noun}`
}

const STATUS_LABEL = { active: 'Activos', archived: 'Archivados', all: 'Todos' } as const

/** Qué filtros definen la lista que se va a cambiar, en palabras. */
export function describeScope(query: InventoryQuery, categories: CategoryRow[]): string[] {
  const scope: string[] = []
  if (query.q) scope.push(`Búsqueda: «${query.q}»`)
  if (query.category) {
    const name = categories.find((category) => category.id === query.category)?.name
    scope.push(name ? `Categoría: ${name}` : 'Una categoría')
  }
  scope.push(`Estado: ${STATUS_LABEL[query.status]}`)
  if (query.low) scope.push('Solo stock bajo')
  return scope
}
