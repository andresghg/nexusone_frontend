'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command'
import { flattenLeaves } from '@/lib/navigation-utils'
import { useAppNavigate } from '@/lib/router-adapter'
import type { NavigationGroup } from '@/types/navigation'

/**
 * Buscador global (⌘K) — la respuesta de UX al crecimiento de módulos.
 *
 * Cuando el sistema tenga 15+ módulos, el sidebar es para EXPLORAR
 * y el buscador es para LLEGAR. Se alimenta de la misma configuración:
 * un módulo nuevo aparece en la búsqueda sin tocar este componente.
 */
export function GlobalSearch({ groups }: { groups: NavigationGroup[] }) {
  const [open, setOpen] = useState(false)
  const navigate = useAppNavigate()
  const leaves = useMemo(() => flattenLeaves(groups).filter((l) => l.status !== 'soon'), [groups])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="Buscar (Ctrl+K)"
        className="h-9 gap-2 text-muted-foreground sm:w-56 sm:justify-start"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} className='p-3'>
        <CommandInput placeholder="Buscar módulos, páginas..." className='outline-none ring-0' />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Navegación">
            {leaves.map((leaf) => (
              <CommandItem
                key={leaf.id}
                value={`${leaf.label} ${leaf.description ?? ''}`}
                onSelect={() => {
                  navigate(leaf.href)
                  setOpen(false)
                }}
              >
                <leaf.icon className="mr-2 size-4 text-muted-foreground" aria-hidden />
                <span>{leaf.label}</span>
                {leaf.description && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {leaf.description}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
