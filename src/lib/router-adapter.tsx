'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

/**
 * ============================================================================
 * Router Adapter — ÚNICO punto de acoplamiento con el sistema de rutas.
 * ----------------------------------------------------------------------------
 * Ningún componente de navegación importa next/link ni next/navigation
 * directamente: todos consumen `AppLink`, `usePathname` y `useAppNavigate`
 * desde aquí.
 *
 * Portado desde react-router (prototipo) a Next.js App Router: este fue el
 * único archivo que cambió. El resto del sistema de navegación quedó intacto.
 * ============================================================================
 */

export const AppLink = Link

/** Re-exportado desde next/navigation: pathname actual, SSR-safe. */
export { usePathname }

/** Equivalente a `useNavigate()` de react-router: navegación imperativa. */
export function useAppNavigate() {
  const router = useRouter()
  return router.push
}
