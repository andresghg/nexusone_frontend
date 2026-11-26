// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NavigationGroup } from '@/types/navigation'
import { installMatchMedia } from './hooks.test-util'
import { useSidebarState } from './use-sidebar-state'

const NARROW = '(max-width: 1023px)'
const KEY = 'nexus.sidebar.collapsed'
const groups: NavigationGroup[] = []

beforeEach(() => {
  window.localStorage.clear()
  installMatchMedia({ [NARROW]: false })
})
afterEach(cleanup)

const setup = (initialPath = '/dashboard/a') =>
  renderHook(({ path }) => useSidebarState(groups, path), { initialProps: { path: initialPath } })

describe('useSidebarState · colapsar (desktop)', () => {
  it('parte expandido y recuerda lo que se guardó', () => {
    expect(setup().result.current.collapsed).toBe(false)
    cleanup()
    window.localStorage.setItem(KEY, 'true')
    expect(setup().result.current.collapsed).toBe(true)
  })

  it('al alternar cambia y se guarda; volver a alternar lo expande', () => {
    const { result } = setup()
    act(() => result.current.toggleCollapsed())
    expect(result.current.collapsed).toBe(true)
    expect(window.localStorage.getItem(KEY)).toBe('true')
    act(() => result.current.toggleCollapsed())
    expect(result.current.collapsed).toBe(false)
    expect(window.localStorage.getItem(KEY)).toBe('false')
  })

  it('en pantalla angosta siempre se muestra expandido, aunque la preferencia sea colapsar', () => {
    window.localStorage.setItem(KEY, 'true')
    installMatchMedia({ [NARROW]: true })
    expect(setup().result.current.collapsed).toBe(false)
  })

  it('al ensanchar la pantalla vuelve la preferencia guardada (no se pierde por haber pasado por móvil)', () => {
    window.localStorage.setItem(KEY, 'true')
    const media = installMatchMedia({ [NARROW]: true })
    const { result } = setup()
    expect(result.current.collapsed).toBe(false)
    act(() => media.setMatches(NARROW, false))
    expect(result.current.collapsed).toBe(true)
  })
})

describe('useSidebarState · drawer móvil', () => {
  it('parte cerrado, abre y cierra', () => {
    const { result } = setup()
    expect(result.current.mobileOpen).toBe(false)
    act(() => result.current.openMobile())
    expect(result.current.mobileOpen).toBe(true)
    act(() => result.current.closeMobile())
    expect(result.current.mobileOpen).toBe(false)
  })

  it('se cierra solo al navegar a otra ruta', () => {
    const { result, rerender } = setup('/dashboard/a')
    act(() => result.current.openMobile())
    expect(result.current.mobileOpen).toBe(true)
    rerender({ path: '/dashboard/a/pos/inventario' })
    expect(result.current.mobileOpen).toBe(false)
  })

  it('seguir en la misma ruta no lo cierra, y volver a abrirlo en la ruta nueva funciona', () => {
    const { result, rerender } = setup('/dashboard/a')
    act(() => result.current.openMobile())
    rerender({ path: '/dashboard/a' })
    expect(result.current.mobileOpen).toBe(true)
    rerender({ path: '/dashboard/a/otra' })
    expect(result.current.mobileOpen).toBe(false)
    act(() => result.current.openMobile())
    expect(result.current.mobileOpen).toBe(true)
  })

  it('volver a una ruta anterior tampoco lo reabre solo', () => {
    const { result, rerender } = setup('/uno')
    act(() => result.current.openMobile())
    rerender({ path: '/dos' })
    rerender({ path: '/uno' })
    expect(result.current.mobileOpen).toBe(false)
  })
})

describe('useSidebarState · ramas del menú', () => {
  it('una rama cerrada se abre y se cierra a mano', () => {
    const { result } = setup()
    expect(result.current.isGroupOpen('pos')).toBe(false)
    act(() => result.current.toggleGroup('pos'))
    expect(result.current.isGroupOpen('pos')).toBe(true)
    act(() => result.current.toggleGroup('pos'))
    expect(result.current.isGroupOpen('pos')).toBe(false)
  })
})
