type PgErrorShape = {
  code?: string
  constraint_name?: string
  constraint?: string
  cause?: unknown
}

// Drizzle envuelve el error de Postgres: el código real puede estar en `cause`.
function findPgError(error: unknown): PgErrorShape | null {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const candidate = current as PgErrorShape
    if (typeof candidate.code === 'string') return candidate
    current = candidate.cause
  }
  return null
}

/** Violación de UNIQUE (23505). `constraintHint` filtra por parte del nombre de la restricción. */
export function isUniqueViolation(error: unknown, constraintHint?: string) {
  const pg = findPgError(error)
  if (pg?.code !== '23505') return false
  if (!constraintHint) return true
  return (pg.constraint_name ?? pg.constraint ?? '').includes(constraintHint)
}

/** Violación de clave foránea (23503). */
export function isForeignKeyViolation(error: unknown) {
  return findPgError(error)?.code === '23503'
}
