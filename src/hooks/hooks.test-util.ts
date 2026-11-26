// Utilidades de prueba para los hooks del shell (sin sufijo .test a propósito: no es un archivo de pruebas)
import { vi } from 'vitest'

type Listener = () => void

/** matchMedia controlable: `setMatches(query, true)` simula que el navegador cambió de tamaño o de tema. */
export function installMatchMedia(initial: Record<string, boolean> = {}) {
  const state = { ...initial }
  const listeners = new Map<string, Set<Listener>>()

  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return state[query] ?? false
    },
    media: query,
    addEventListener: (_: string, fn: Listener) => {
      if (!listeners.has(query)) listeners.set(query, new Set())
      listeners.get(query)!.add(fn)
    },
    removeEventListener: (_: string, fn: Listener) => listeners.get(query)?.delete(fn),
  })) as never

  return {
    setMatches(query: string, value: boolean) {
      state[query] = value
      listeners.get(query)?.forEach((fn) => fn())
    },
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
  }
}
