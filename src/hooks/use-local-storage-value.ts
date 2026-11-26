import { useCallback, useSyncExternalStore } from 'react'

// El evento nativo `storage` solo avisa a las OTRAS pestañas: para esta misma se avisa a mano
const listeners = new Set<() => void>()

function subscribe(notify: () => void) {
  listeners.add(notify)
  window.addEventListener('storage', notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null // modo privado o almacenamiento bloqueado
  }
}

/**
 * Un valor de texto guardado en localStorage, sincronizado entre componentes y pestañas.
 * Durante el render en el servidor y la hidratación vale `null` (no hay almacenamiento): así el HTML del servidor
 * y el primer render del cliente coinciden, y el valor guardado entra enseguida sin errores de hidratación.
 */
export function useLocalStorageValue(key: string): [string | null, (next: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // sin almacenamiento: la preferencia dura hasta recargar
      }
      listeners.forEach((notify) => notify())
    },
    [key],
  )
  return [value, set]
}
