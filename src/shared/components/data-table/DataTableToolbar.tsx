'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  buildTableQuery,
  hasActiveFilters,
  type QuerySpec,
  type TableQuery,
} from '@/lib/table-query'
import { cn } from '@/lib/utils'
import type { ToolbarControl } from './types'

// Radix no admite un <SelectItem value="">: la opción "sin filtro" usa este valor interno.
const EMPTY = '__empty__'

type Props = {
  spec: QuerySpec
  query: TableQuery
  controls: ToolbarControl[]
}

function SearchBox({
  control,
  value,
  onCommit,
}: {
  control: Extract<ToolbarControl, { type: 'search' }>
  value: string
  onCommit: (value: string) => void
}) {
  const [text, setText] = useState(value)

  // Si la URL cambia desde fuera (p. ej. "Limpiar"), el campo la sigue sin pisar lo que se está
  // escribiendo. Se ajusta durante el render (patrón recomendado por React), no dentro de un efecto.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText((current) => (current.trim() === value ? current : value))
  }

  // Espera a que el usuario deje de escribir: no se consulta en cada tecla
  useEffect(() => {
    if (text.trim() === value) return
    const timer = setTimeout(() => onCommit(text.trim()), 300)
    return () => clearTimeout(timer)
  }, [text, value, onCommit])

  return (
    <div className="relative min-w-52 flex-1 sm:max-w-xs">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={control.placeholder}
        aria-label={control.ariaLabel}
        className="pl-9"
      />
    </div>
  )
}

/** Barra de filtros. Cada cambio actualiza la URL y vuelve a la primera página. */
export function DataTableToolbar({ spec, query, controls }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const update = useCallback(
    (key: string, value: string) => {
      const next: TableQuery = { filters: { ...query.filters, [key]: value }, page: 1 }
      router.replace(`${pathname}${buildTableQuery(next, spec)}`)
    },
    [router, pathname, query.filters, spec],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {controls.map((control) => {
        const value = query.filters[control.key] ?? ''

        switch (control.type) {
          case 'search':
            return (
              <SearchBox
                key={control.key}
                control={control}
                value={value}
                onCommit={(next) => update(control.key, next)}
              />
            )

          case 'select':
            return (
              <Select
                key={control.key}
                value={control.emptyOption !== undefined && value === '' ? EMPTY : value}
                onValueChange={(next) => update(control.key, next === EMPTY ? '' : next)}
              >
                <SelectTrigger className={cn('w-48', control.className)} aria-label={control.ariaLabel}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {control.emptyOption !== undefined && (
                    <SelectItem value={EMPTY}>{control.emptyOption}</SelectItem>
                  )}
                  {control.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )

          case 'toggle': {
            const active = value === '1'
            const Icon = control.icon
            return (
              <Button
                key={control.key}
                variant={active ? 'secondary' : 'outline'}
                aria-pressed={active}
                onClick={() => update(control.key, active ? '' : '1')}
              >
                {Icon && <Icon aria-hidden />}
                {control.label}
              </Button>
            )
          }
        }
      })}

      {hasActiveFilters(query, spec) && (
        <Button variant="ghost" onClick={() => router.replace(pathname)}>
          <X aria-hidden />
          Limpiar
        </Button>
      )}
    </div>
  )
}
