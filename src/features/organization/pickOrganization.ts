/** Slug de la empresa en una ruta del dashboard: '/dashboard/acme/pos' → 'acme'. */
export function extractOrganizationSlug(pathname: string) {
  return pathname.match(/^\/dashboard\/([^/]+)/)?.[1] ?? null
}

/**
 * Empresa a la que entrar desde `/dashboard`: la última usada, si todavía es una de
 * las del usuario; si no, la primera. `lastSlug` es solo una pista: la autoridad son
 * las membresías (`organizations`), que ya vienen filtradas por usuario.
 */
export function pickInitialOrganization<T extends { slug: string }>(
  organizations: T[],
  lastSlug?: string,
): T | undefined {
  return organizations.find((o) => o.slug === lastSlug) ?? organizations[0]
}