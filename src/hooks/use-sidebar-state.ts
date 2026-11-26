import { useCallback, useMemo, useState } from 'react'
import { useLocalStorageValue } from '@/hooks/use-local-storage-value'
import { useMediaQuery } from '@/hooks/use-media-query'
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
  // La preferencia persiste; en pantallas angostas el menú es un drawer y siempre se muestra expandido
  const [storedCollapsed, setStoredCollapsed] = useLocalStorageValue(COLLAPSED_KEY)
  const isNarrow = useMediaQuery('(max-width: 1023px)')
  const collapsed = storedCollapsed === 'true' && !isNarrow

  // El drawer se cierra al navegar (regla de UX móvil). Se reinicia durante el render al cambiar la ruta
  // —el patrón de React para esto— en vez de un efecto que cause un render extra
  const [mobileOpen, setMobileOpen] = useState(false)
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setMobileOpen(false)
  }
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const toggleCollapsed = useCallback(() => setStoredCollapsed(String(storedCollapsed !== 'true')), [storedCollapsed, setStoredCollapsed])
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
