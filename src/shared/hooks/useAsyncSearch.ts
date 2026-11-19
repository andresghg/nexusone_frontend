'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Options = {
  /** Solo busca mientras esté activo (p. ej. con la lista abierta). */
  enabled: boolean
  /** Espera tras la última tecla, en ms. Con el texto vacío busca de inmediato. */
  delay?: number
}

type State<T> = {
  results: T[]
  /** El texto con el que se obtuvieron los resultados actuales (null = aún no hubo ninguna búsqueda). */
  resultsFor: string | null
  loading: boolean
  failed: boolean
}

/**
 * Búsqueda con retraso para listas desplegables: espera a que se deje de escribir y descarta las
 * respuestas atrasadas (si la búsqueda de "co" tarda más que la de "cola", no pisa el resultado).
 * `searchNow` busca sin esperar, para un lector de códigos de barras que escribe y pulsa Enter al instante.
 */
export function useAsyncSearch<T>(search: (query: string) => Promise<T[]>, { enabled, delay = 250 }: Options) {
  const searchRef = useRef(search)
  useEffect(() => {
    searchRef.current = search
  })

  const [query, setQuery] = useState('')
  const [state, setState] = useState<State<T>>({ results: [], resultsFor: null, loading: false, failed: false })
  const latest = useRef(0)

  const searchNow = useCallback(async (text: string): Promise<T[]> => {
    const id = ++latest.current
    setState((current) => ({ ...current, loading: true }))
    try {
      const results = await searchRef.current(text)
      if (id === latest.current) setState({ results, resultsFor: text, loading: false, failed: false })
      return results
    } catch {
      if (id === latest.current) setState({ results: [], resultsFor: text, loading: false, failed: true })
      return []
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const timer = setTimeout(() => void searchNow(query), query.trim() === '' ? 0 : delay)
    return () => clearTimeout(timer)
  }, [enabled, query, delay, searchNow])

  return { query, setQuery, ...state, searchNow }
}
