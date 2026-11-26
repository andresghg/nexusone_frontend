// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installMatchMedia } from './hooks.test-util'
import { useTheme } from './use-theme'

const DARK = '(prefers-color-scheme: dark)'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})
afterEach(cleanup)

describe('useTheme', () => {
  it('sin preferencia guardada sigue el tema del sistema', () => {
    installMatchMedia({ [DARK]: true })
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('sistema claro → tema claro y sin la clase dark', () => {
    installMatchMedia({ [DARK]: false })
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('la preferencia guardada manda sobre el sistema', () => {
    installMatchMedia({ [DARK]: true })
    window.localStorage.setItem('nexus.theme', 'light')
    expect(renderHook(() => useTheme()).result.current.theme).toBe('light')
  })

  it('un valor guardado inválido se ignora', () => {
    installMatchMedia({ [DARK]: true })
    window.localStorage.setItem('nexus.theme', 'azul')
    expect(renderHook(() => useTheme()).result.current.theme).toBe('dark')
  })

  it('al alternar cambia el tema, la clase del documento y se guarda la elección', () => {
    installMatchMedia({ [DARK]: false })
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('nexus.theme')).toBe('dark')
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('nexus.theme')).toBe('light')
  })

  it('mientras no se elige, no escribe nada en localStorage (sigue al sistema)', () => {
    installMatchMedia({ [DARK]: true })
    renderHook(() => useTheme())
    expect(window.localStorage.getItem('nexus.theme')).toBeNull()
  })

  it('si el sistema cambia y la persona no eligió, el tema lo sigue', () => {
    const media = installMatchMedia({ [DARK]: false })
    const { result } = renderHook(() => useTheme())
    act(() => media.setMatches(DARK, true))
    expect(result.current.theme).toBe('dark')
  })
})
