import { useCallback, useEffect } from 'react'
import { useLocalStorageValue } from '@/hooks/use-local-storage-value'
import { useMediaQuery } from '@/hooks/use-media-query'

type Theme = 'light' | 'dark'
const THEME_KEY = 'nexus.theme'

/**
 * Dark mode por clase (`document.documentElement.classList`).
 * Preparado desde la arquitectura: ningún componente usa colores hardcodeados,
 * solo tokens semánticos de Tailwind (bg-background, text-muted-foreground...),
 * por lo que el tema se adapta sin tocar un solo componente.
 *
 * Mientras la persona no elija, se sigue el tema del sistema; al elegir se guarda su preferencia.
 */
export function useTheme() {
  const [stored, setStored] = useLocalStorageValue(THEME_KEY)
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const theme: Theme = stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = useCallback(() => setStored(theme === 'dark' ? 'light' : 'dark'), [theme, setStored])

  return { theme, toggleTheme }
}
