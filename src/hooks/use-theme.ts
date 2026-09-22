import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const THEME_KEY = 'nexus.theme'

/**
 * Dark mode por clase (`document.documentElement.classList`).
 * Preparado desde la arquitectura: ningún componente usa colores hardcodeados,
 * solo tokens semánticos de Tailwind (bg-background, text-muted-foreground...),
 * por lo que el tema se adapta sin tocar un solo componente.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  return { theme, toggleTheme }
}
