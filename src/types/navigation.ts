import type { LucideIcon } from 'lucide-react'

/**
 * ============================================================================
 * Tipos del sistema de navegación
 * ----------------------------------------------------------------------------
 * Este archivo NO tiene dependencias de UI ni de router: es portable tal cual
 * a Next.js App Router. Define el contrato entre la CONFIGURACIÓN declarativa
 * (config/navigation.ts) y los COMPONENTES de renderizado (components/navigation).
 *
 * Para agregar un módulo nuevo al sistema solo se toca la configuración;
 * estos tipos garantizan en compile-time que la configuración sea válida.
 * ============================================================================
 */

/** Permiso granular. En producción vendrá del rol/sesión del usuario. */
export type Permission =
  | 'pos.facturacion.read'
  | 'pos.facturacion.create'
  | 'pos.inventario.read'
  | 'gestion.calendario.read'
  | 'gestion.tareas.read'
  | 'gestion.mensajeria.read'
  | 'finanzas.bancos.read'
  | 'finanzas.reportes.read'
  | 'config.empresa.read'
  | 'config.usuarios.read'

/**
 * Ciclo de vida de un módulo:
 * - 'active'   → navegable.
 * - 'soon'     → visible pero no navegable (comunica roadmap, reduce soporte).
 * - 'disabled' → no se renderiza (feature flag apagado).
 */
export type ModuleStatus = 'active' | 'soon' | 'disabled'

/** Insignia junto al label: contadores ("3"), estados ("Pronto"), etc. */
export interface NavBadge {
  label: string
  variant?: 'default' | 'secondary' | 'outline' | 'destructive'
}

/** Estrategia para marcar activo: 'exact' o 'prefix' (rutas hijas/segmentos dinámicos). */
export type ActiveMatch = 'exact' | 'prefix'

interface NavItemBase {
  /** Identificador estable: clave para estado de UI, analytics y tests. */
  id: string
  label: string
  icon: LucideIcon
  badge?: NavBadge
  /** Si se omite, el ítem es visible para cualquier usuario autenticado. */
  permissions?: Permission[]
  status?: ModuleStatus
  /** Descripción corta: tooltips en modo colapsado, búsqueda global, empty states. */
  description?: string
}

/** Ítem hoja: navega a una ruta. */
export interface NavLeaf extends NavItemBase {
  href: string
  activeMatch?: ActiveMatch
  children?: never
}

/** Ítem rama: agrupa hijos, NO navega por sí mismo. */
export interface NavBranch extends NavItemBase {
  children: NavLeaf[]
  href?: never
}

export type NavigationItem = NavLeaf | NavBranch

/**
 * Grupo de primer nivel ("POS", "Gestión", "Finanzas"...).
 * El label es la única "decoración" jerárquica del sidebar: separa dominios
 * sin necesidad de anidar más de 2 niveles.
 */
export interface NavigationGroup {
  id: string
  label: string
  items: NavigationItem[]
  permissions?: Permission[]
}

/** Segmento de breadcrumb derivado de la configuración. */
export interface BreadcrumbSegment {
  label: string
  href?: string
}

/** Type guards: permiten renderizar sin casts ni `any`. */
export function isBranch(item: NavigationItem): item is NavBranch {
  return Array.isArray((item as NavBranch).children)
}

export function isLeaf(item: NavigationItem): item is NavLeaf {
  return !isBranch(item)
}
