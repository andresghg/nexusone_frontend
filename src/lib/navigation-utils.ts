import {
  isBranch,
  type BreadcrumbSegment,
  type NavLeaf,
  type NavigationGroup,
  type NavigationItem,
  type Permission,
} from '@/types/navigation'

/**
 * ============================================================================
 * Lógica pura de navegación — sin React, sin router, 100% testeable.
 * ----------------------------------------------------------------------------
 * Aquí viven las tres preguntas que el sistema debe responder:
 *   1. ¿Está activo?        → isLeafActive / isItemActive
 *   2. ¿Puede verlo?        → filterByPermissions
 *   3. ¿Dónde estoy?        → findBreadcrumbs / flattenLeaves
 * ============================================================================
 */

/**
 * Estado activo de una hoja.
 * - 'exact'  : la ruta debe coincidir exactamente (evita falsos positivos,
 *              p. ej. "/pos/facturacion" vs "/pos/facturacion/nueva").
 * - 'prefix' : activo también en rutas hijas y segmentos dinámicos
 *              ("/pos/inventario/productos/42" activa "Productos").
 */
export function isLeafActive(leaf: NavLeaf, pathname: string): boolean {
  const match: NonNullable<NavLeaf['activeMatch']> = leaf.activeMatch ?? 'prefix'
  if (pathname === leaf.href) return true
  return match === 'prefix' && pathname.startsWith(`${leaf.href}/`)
}

/** Una rama está activa si alguno de sus hijos lo está. */
export function isItemActive(item: NavigationItem, pathname: string): boolean {
  if (isBranch(item)) return item.children.some((child) => isLeafActive(child, pathname))
  return isLeafActive(item, pathname)
}

function hasAccess(required: Permission[] | undefined, granted: readonly Permission[]): boolean {
  if (!required || required.length === 0) return true
  return required.some((p) => granted.includes(p))
}

/**
 * Filtra la navegación según permisos y estado del módulo.
 * - 'disabled' desaparece por completo (feature flag).
 * - ramas que quedan sin hijos visibles desaparecen (nunca un menú vacío).
 * - grupos que quedan sin ítems desaparecen.
 */
export function filterByPermissions(
  groups: NavigationGroup[],
  granted: readonly Permission[],
): NavigationGroup[] {
  return groups
    .filter((group) => hasAccess(group.permissions, granted))
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => item.status !== 'disabled' && hasAccess(item.permissions, granted))
        .map((item): NavigationItem => {
          if (!isBranch(item)) return item
          const children = item.children.filter(
            (child) => child.status !== 'disabled' && hasAccess(child.permissions, granted),
          )
          return { ...item, children }
        })
        .filter((item) => (isBranch(item) ? item.children.length > 0 : true)),
    }))
    .filter((group) => group.items.length > 0)
}

/** Aplana todas las hojas visibles: base del buscador global (⌘K). */
export function flattenLeaves(groups: NavigationGroup[]): NavLeaf[] {
  return groups.flatMap((group) =>
    group.items.flatMap((item) => (isBranch(item) ? item.children : [item])),
  )
}

/**
 * Deriva el breadcrumb desde la configuración + pathname.
 * La fuente de verdad es UNA: si agregas un módulo a la config,
 * el breadcrumb aparece solo. Cero componentes que tocar.
 */
export function findBreadcrumbs(groups: NavigationGroup[], pathname: string): BreadcrumbSegment[] {
  for (const group of groups) {
    for (const item of group.items) {
      if (isBranch(item)) {
        const child = item.children.find((c) => isLeafActive(c, pathname))
        if (child) {
          return [
            { label: group.label },
            { label: item.label },
            { label: child.label, href: child.href },
          ]
        }
      } else if (isLeafActive(item, pathname)) {
        return [{ label: group.label }, { label: item.label, href: item.href }]
      }
    }
  }
  return []
}

/** IDs de ramas que contienen la ruta activa (para auto-expandirlas). */
export function findActiveBranchIds(groups: NavigationGroup[], pathname: string): string[] {
  return groups.flatMap((group) =>
    group.items.filter((item) => isBranch(item) && isItemActive(item, pathname)).map((i) => i.id),
  )
}
