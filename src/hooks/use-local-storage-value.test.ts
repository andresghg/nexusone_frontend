// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocalStorageValue } from './use-local-storage-value'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useLocalStorageValue', () => {
  it('lee el valor guardado y null si no hay', () => {
    window.localStorage.setItem('a', 'uno')
    expect(renderHook(() => useLocalStorageValue('a')).result.current[0]).toBe('uno')
    expect(renderHook(() => useLocalStorageValue('b')).result.current[0]).toBeNull()
  })

  it('al guardar, escribe en localStorage y actualiza el componente', () => {
    const { result } = renderHook(() => useLocalStorageValue('k'))
    act(() => result.current[1]('x'))
    expect(window.localStorage.getItem('k')).toBe('x')
    expect(result.current[0]).toBe('x')
  })

  it('dos componentes con la misma clave se mantienen sincronizados en la misma pestaña', () => {
    const first = renderHook(() => useLocalStorageValue('k'))
    const second = renderHook(() => useLocalStorageValue('k'))
    act(() => first.result.current[1]('compartido'))
    expect(second.result.current[0]).toBe('compartido')
  })

  it('se entera de los cambios hechos desde otra pestaña (evento storage)', () => {
    const { result } = renderHook(() => useLocalStorageValue('k'))
    act(() => {
      window.localStorage.setItem('k', 'otra-pestaña')
      window.dispatchEvent(new StorageEvent('storage', { key: 'k' }))
    })
    expect(result.current[0]).toBe('otra-pestaña')
  })

  it('claves distintas no se mezclan', () => {
    const a = renderHook(() => useLocalStorageValue('a'))
    const b = renderHook(() => useLocalStorageValue('b'))
    act(() => a.result.current[1]('1'))
    expect(b.result.current[0]).toBeNull()
  })

  it('si el almacenamiento está bloqueado no lanza: lee null y el guardado se ignora', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const { result } = renderHook(() => useLocalStorageValue('k'))
    expect(result.current[0]).toBeNull()
    expect(() => act(() => result.current[1]('x'))).not.toThrow()
  })

  it('en el servidor (sin hidratar) vale null aunque el navegador tenga un valor: el HTML coincide con el del servidor', () => {
    window.localStorage.setItem('k', 'guardado')
    const Probe = () => createElement('span', null, String(useLocalStorageValue('k')[0]))
    expect(renderToString(createElement(Probe))).toContain('null')
  })
})
