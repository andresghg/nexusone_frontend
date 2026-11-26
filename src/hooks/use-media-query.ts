import { useCallback, useSyncExternalStore } from 'react'

/**
 * Si el navegador cumple una media query, y se actualiza solo cuando cambia.
 * En el servidor (y en la hidratación) devuelve `false`: el cliente corrige en cuanto monta, sin
 * desajuste de hidratación y sin guardar el valor en un estado dentro de un efecto.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', notify)
      return () => media.removeEventListener('change', notify)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
