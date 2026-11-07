import { vi } from 'vitest'

// Estos tests no tocan la base de datos: así importar un repository
// no abre conexiones ni exige DATABASE_URL.
vi.mock('@/db', () => ({ db: {} }))

// Este paquete lanza error fuera de Next.js (por si lo agregaste a algún archivo)
vi.mock('server-only', () => ({}))

// Solo en pruebas de componentes (jsdom): Radix usa APIs del navegador que jsdom no trae
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLElement.prototype.hasPointerCapture = vi.fn()
  window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
