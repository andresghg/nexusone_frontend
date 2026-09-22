import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NavigationGroup } from '@/types/navigation'
import { findActiveBranchIds } from '@/lib/navigation-utils'

const COLLAPSED_KEY = 'nexus.sidebar.collapsed'

/**
 * Estado del sidebar con separación de responsabilidades:
 * - `collapsed`  : preferencia persistente de desktop (localStorage).
 * - `mobileOpen` : estado efímero del drawer móvil (nunca persiste).
 * - `overrides`  : ramas abiertas/cerradas manualmente por el usuario.
 *
 * Regla de expansión: una rama está abierta si el usuario lo decidió
 * explícitamente (override) o si contiene la ruta activa (auto-expansión).
 * Así el usuario siempre ve dónde está, sin que el menú "salte" solo.
 */
export function useSidebarState(groups: NavigationGroup[], pathname: string) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false // SSR-safe (Next.js)
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true'
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  // Cerrar el drawer al navegar (regla de UX móvil).
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
  const mediaQuery = window.matchMedia('(max-width: 1023px)')

  const handleChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      setCollapsed(false)
    }
  }

  // Si la app inicia directamente en móvil
  if (mediaQuery.matches) {
    setCollapsed(false)
  }

  mediaQuery.addEventListener('change', handleChange)

  return () => {
    mediaQuery.removeEventListener('change', handleChange)
  }
}, [])

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), [])
  const openMobile = useCallback(() => setMobileOpen(true), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const activeBranchIds = useMemo(() => findActiveBranchIds(groups, pathname), [groups, pathname])

  const isGroupOpen = useCallback(
    (id: string) => overrides[id] ?? activeBranchIds.includes(id),
    [overrides, activeBranchIds],
  )

  const toggleGroup = useCallback(
    (id: string) => {
      setOverrides((prev) => ({ ...prev, [id]: !isGroupOpen(id) }))
    },
    [isGroupOpen],
  )

  return {
    collapsed,
    toggleCollapsed,
    mobileOpen,
    openMobile,
    closeMobile,
    isGroupOpen,
    toggleGroup,
  }
}
