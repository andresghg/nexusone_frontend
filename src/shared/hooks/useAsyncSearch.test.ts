// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAsyncSearch } from './useAsyncSearch'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('useAsyncSearch', () => {
  it('no busca mientras esté desactivado', async () => {
    const search = vi.fn().mockResolvedValue([])
    renderHook(() => useAsyncSearch(search, { enabled: false }))
    await advance(1000)
    expect(search).not.toHaveBeenCalled()
  })

  it('al activarse busca de inmediato con el texto vacío', async () => {
    const search = vi.fn().mockResolvedValue(['a', 'b'])
    const { result } = renderHook(() => useAsyncSearch(search, { enabled: true }))
    await flush()
    expect(search).toHaveBeenCalledWith('')
    expect(result.current.results).toEqual(['a', 'b'])
    expect(result.current.resultsFor).toBe('')
    expect(result.current.loading).toBe(false)
  })

  it('espera a que se deje de escribir y busca una sola vez', async () => {
    const search = vi.fn().mockResolvedValue([])
    const { result } = renderHook(() => useAsyncSearch(search, { enabled: true, delay: 250 }))
    await flush()
    search.mockClear()

    act(() => result.current.setQuery('c'))
    await advance(100)
    act(() => result.current.setQuery('co'))
    await advance(100)
    act(() => result.current.setQuery('col'))
    await advance(249)
    expect(search).not.toHaveBeenCalled()
    await advance(1)
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('col')
  })

  it('descarta la respuesta atrasada de una búsqueda anterior', async () => {
    let resolveSlow!: (value: string[]) => void
    const search = vi.fn((text: string) =>
      text === 'co' ? new Promise<string[]>((resolve) => (resolveSlow = resolve)) : Promise.resolve([`resultado de ${text}`]),
    )
    const { result } = renderHook(() => useAsyncSearch(search, { enabled: true, delay: 10 }))
    await flush()

    act(() => result.current.setQuery('co'))
    await advance(10) // la búsqueda de "co" queda en vuelo
    act(() => result.current.setQuery('cola'))
    await advance(10)
    expect(result.current.results).toEqual(['resultado de cola'])

    await act(async () => resolveSlow(['resultado viejo de co']))
    expect(result.current.results).toEqual(['resultado de cola']) // no lo pisa
    expect(result.current.resultsFor).toBe('cola')
  })

  it('si la búsqueda falla deja la lista vacía y lo indica', async () => {
    const search = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAsyncSearch(search, { enabled: true }))
    await flush()
    expect(result.current).toMatchObject({ results: [], failed: true, loading: false })
  })

  it('una búsqueda posterior exitosa limpia el error', async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(['ok'])
    const { result } = renderHook(() => useAsyncSearch(search, { enabled: true, delay: 10 }))
    await flush()
    expect(result.current.failed).toBe(true)
    act(() => result.current.setQuery('x'))
    await advance(10)
    expect(result.current).toMatchObject({ results: ['ok'], failed: false })
  })

  it('searchNow busca sin esperar y devuelve los resultados', async () => {
    const search = vi.fn().mockResolvedValue(['7801234567890'])
    const { result } = renderHook(() => useAsyncSearch(search, { enabled: true, delay: 250 }))
    await flush()
    search.mockClear()

    let found: string[] = []
    await act(async () => { found = (await result.current.searchNow("7801234567890")) as string[] })
    expect(found).toEqual(['7801234567890'])
    expect(search).toHaveBeenCalledWith('7801234567890')
  })

  it('usa siempre la función de búsqueda más reciente', async () => {
    const first = vi.fn().mockResolvedValue(['primera'])
    const second = vi.fn().mockResolvedValue(['segunda'])
    const { result, rerender } = renderHook(({ fn }) => useAsyncSearch(fn, { enabled: true, delay: 10 }), { initialProps: { fn: first } })
    await flush()
    rerender({ fn: second })
    act(() => result.current.setQuery('x'))
    await advance(10)
    expect(second).toHaveBeenCalledWith('x')
    expect(result.current.results).toEqual(['segunda'])
  })
})
