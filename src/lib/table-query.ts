// Estado de una tabla (filtros y página) guardado en la URL: se puede recargar, compartir y usar
// con el botón "atrás". Genérico: cada módulo describe sus filtros con un `QuerySpec` y obtiene
// parseo seguro y serialización sin escribir su propio código. Seguro para el cliente.

export type FieldSpec =
  | { kind: 'text'; max?: number } // texto libre (búsqueda)
  | { kind: 'enum'; values: readonly string[]; default: string } // una opción de una lista
  | { kind: 'uuid' } // id de otra entidad (p. ej. una categoría)
  | { kind: 'flag' } // interruptor: '1' = activo

export type QuerySpec = Record<string, FieldSpec>

// Todos los filtros viajan como texto: '' significa "sin filtro" (salvo los enum, que tienen default).
export type TableQuery = { filters: Record<string, string>; page: number }

type RawParams = Record<string, string | string[] | undefined>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const defaultOf = (field: FieldSpec) => (field.kind === 'enum' ? field.default : '')

/** La URL es entrada del usuario: todo valor inválido cae a su valor por defecto. */
export function parseTableQuery(params: RawParams, spec: QuerySpec): TableQuery {
  const filters: Record<string, string> = {}

  for (const [key, field] of Object.entries(spec)) {
    const raw = first(params[key])
    switch (field.kind) {
      case 'text':
        filters[key] = (raw ?? '').trim().slice(0, field.max ?? 100)
        break
      case 'enum':
        filters[key] = raw !== undefined && field.values.includes(raw) ? raw : field.default
        break
      case 'uuid':
        filters[key] = raw && UUID.test(raw) ? raw : ''
        break
      case 'flag':
        filters[key] = raw === '1' ? '1' : ''
        break
    }
  }

  const page = Number.parseInt(first(params.page) ?? '1', 10)
  return { filters, page: Number.isFinite(page) && page >= 1 ? page : 1 }
}

/** '?q=cola&page=2'. Omite los valores por defecto para mantener las URLs limpias. */
export function buildTableQuery(query: TableQuery, spec: QuerySpec) {
  const params = new URLSearchParams()

  for (const [key, field] of Object.entries(spec)) {
    const value = query.filters[key] ?? ''
    if (value && value !== defaultOf(field)) params.set(key, value)
  }
  if (query.page > 1) params.set('page', String(query.page))

  const text = params.toString()
  return text ? `?${text}` : ''
}

/** ¿Hay algún filtro distinto de su valor por defecto? (la página no cuenta) */
export function hasActiveFilters(query: TableQuery, spec: QuerySpec) {
  return Object.entries(spec).some(
    ([key, field]) => (query.filters[key] ?? defaultOf(field)) !== defaultOf(field),
  )
}
