'use client'

import { useCallback, useState } from 'react'
import { Check, ChevronsUpDown, Plus, UserRound, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/shared/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Spinner } from '@/shared/components/ui/spinner'
import { useAsyncSearch } from '@/shared/hooks/useAsyncSearch'
import { searchCustomersAction } from '@/features/customers/action/customer-action'
import type { CustomerOption } from '@/features/customers/types/customers'

type Props = {
  organizationId: string
  value: CustomerOption | null
  onChange: (customer: CustomerOption | null) => void
  /** Solo si puede crear clientes se ofrece "Nuevo cliente". */
  onCreate?: () => void
}

/** Elige el cliente del documento. Sin cliente = consumidor final. */
export function CustomerPicker({ organizationId, value, onChange, onCreate }: Props) {
  const [open, setOpen] = useState(false)

  const search = useCallback(
    async (query: string) => {
      const { error, customers } = await searchCustomersAction({ organizationId, query })
      if (error) throw new Error(error)
      return customers
    },
    [organizationId],
  )
  const { query, setQuery, results, resultsFor, loading, failed } = useAsyncSearch(search, { enabled: open })

  const choose = (customer: CustomerOption | null) => {
    onChange(customer)
    setQuery('')
    setOpen(false)
  }

  const showEmpty = !loading && !failed && resultsFor !== null && results.length === 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Cliente"
          className="h-auto w-full justify-between py-2 text-left font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {value ? (
              <span className="min-w-0">
                <span className="block truncate">{value.name}</span>
                {value.taxId && <span className="block truncate text-xs text-muted-foreground">{value.taxId}</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin cliente</span>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command label="Buscar cliente" shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar por nombre, RUT, correo o teléfono"
          />
          <CommandList>
            {results.map((customer) => (
              <CommandItem key={customer.id} value={customer.id} onSelect={() => choose(customer)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{customer.name}</p>
                  {customer.taxId && <p className="truncate text-xs text-muted-foreground">{customer.taxId}</p>}
                </div>
                {value?.id === customer.id && <Check className="size-4" aria-label="Seleccionado" />}
              </CommandItem>
            ))}
          </CommandList>

          {loading && results.length === 0 && (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Spinner /> Buscando…
            </p>
          )}
          {failed && (
            <p role="alert" className="px-3 py-3 text-sm text-destructive">
              No se pudo buscar. Intenta de nuevo.
            </p>
          )}
          {showEmpty && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {query.trim() ? `Sin resultados para "${query.trim()}"` : 'Aún no hay clientes'}
            </p>
          )}

          {(value || onCreate) && <CommandSeparator />}
          <CommandGroup>
            {value && (
              <CommandItem value="__none__" onSelect={() => choose(null)}>
                <X className="size-4" aria-hidden />
                Quitar cliente (sin cliente)
              </CommandItem>
            )}
            {onCreate && (
              <CommandItem
                value="__new__"
                onSelect={() => {
                  setOpen(false)
                  onCreate()
                }}
              >
                <Plus className="size-4" aria-hidden />
                Nuevo cliente
              </CommandItem>
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
