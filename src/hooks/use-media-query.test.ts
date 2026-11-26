// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { installMatchMedia } from './hooks.test-util'
import { useIsMobile } from './use-mobile'
import { useMediaQuery } from './use-media-query'

afterEach(cleanup)

describe('useMediaQuery', () => {
  it('parte del valor actual del navegador', () => {
    installMatchMedia({ '(max-width: 600px)': true })
    expect(renderHook(() => useMediaQuery('(max-width: 600px)')).result.current).toBe(true)
    expect(renderHook(() => useMediaQuery('(max-width: 300px)')).result.current).toBe(false)
  })

  it('se actualiza cuando cambia la media query', () => {
    const media = installMatchMedia({ '(max-width: 600px)': false })
    const { result } = renderHook(() => useMediaQuery('(max-width: 600px)'))
    expect(result.current).toBe(false)
    act(() => media.setMatches('(max-width: 600px)', true))
    expect(result.current).toBe(true)
    act(() => media.setMatches('(max-width: 600px)', false))
    expect(result.current).toBe(false)
  })

  it('en el servidor (sin hidratar) vale false aunque el navegador cumpla la consulta: el HTML coincide con el del servidor', () => {
    installMatchMedia({ '(max-width: 600px)': true })
    const Probe = () => createElement('span', null, String(useMediaQuery('(max-width: 600px)')))
    expect(renderToString(createElement(Probe))).toContain('false')
  })

  it('no deja escuchas colgadas al desmontar ni acumula una por cada render', () => {
    const media = installMatchMedia()
    const { rerender, unmount } = renderHook(() => useMediaQuery('(max-width: 600px)'))
    rerender()
    rerender()
    expect(media.listenerCount('(max-width: 600px)')).toBe(1)
    unmount()
    expect(media.listenerCount('(max-width: 600px)')).toBe(0)
  })
})

describe('useIsMobile', () => {
  it('es móvil por debajo de 768 px', () => {
    const media = installMatchMedia({ '(max-width: 767px)': true })
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
    act(() => media.setMatches('(max-width: 767px)', false))
    expect(result.current).toBe(false)
  })
})
