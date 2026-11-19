'use client'

import { useCallback, useState, type KeyboardEvent } from 'react'
import { PackageSearch } from 'lucide-react'
import { Command, CommandInput, CommandItem, CommandList } from '@/shared/components/ui/command'
import { Spinner } from '@/shared/components/ui/spinner'
import { useAsyncSearch } from '@/shared/hooks/useAsyncSearch'
import { formatQuantity, toMilli } from '@/features/inventory/utils/stockMath'
import { searchProductsAction } from '../action/invoice-action'
import type { ProductOption } from '../types/invoice'
import { formatMoney, type MoneyFormat } from '../utils/formatMoney'

type Props = {
  organizationId: string
  format: MoneyFormat
  onPick: (product: ProductOption) => void
}

function stockLabel(product: ProductOption) {
  if (!product.trackStock || product.stock === null) return { text: 'Sin control de stock', warn: false }
  if (product.stock <= 0) return { text: 'Sin stock', warn: true }
  return { text: `Stock: ${formatQuantity(toMilli(product.stock))} ${product.unit}`, warn: false }
}

/**
 * Buscador de productos por nombre, SKU o código de barras. Pensado también para un lector de códigos:
 * escribe el código y pulsa Enter al instante, así que Enter no espera a la búsqueda con retraso.
 */
export function ProductPicker({ organizationId, format, onPick }: Props) {
  const [open, setOpen] = useState(false)

  const search = useCallback(
    async (query: string) => {
      const { error, products } = await searchProductsAction({ organizationId, query })
      if (error) throw new Error(error)
      return products
    },
    [organizationId],
  )
  const { query, setQuery, results, resultsFor, loading, failed, searchNow } = useAsyncSearch(search, { enabled: open })

  const pick = (product: ProductOption) => {
    onPick(product)
    setQuery('') // listo para el siguiente producto
    setOpen(false)
  }

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key !== 'Enter') return

    // Si los resultados aún no corresponden a lo escrito (lector de códigos), se busca ya y no se
    // deja que la lista elija un resultado viejo.
    const typed = query.trim()
    if (typed && (loading || resultsFor !== query)) {
      event.preventDefault()
      event.stopPropagation()
      const found = await searchNow(query)
      const code = typed.toLowerCase()
      const exact = found.find((p) => p.barcode?.toLowerCase() === code || p.sku.toLowerCase() === code)
      const chosen = exact ?? (found.length === 1 ? found[0] : undefined)
      if (chosen) pick(chosen)
    }
  }

  const showEmpty = !loading && !failed && resultsFor !== null && results.length === 0

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <Command
        label="Buscar producto"
        shouldFilter={false}
        loop
        className="overflow-visible rounded-lg border bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 [&_[data-slot=command-input-wrapper]]:border-b-0"
      >
        <CommandInput
          value={query}
          onValueChange={(value) => {
            setQuery(value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar producto o escanear código"
          className="outline-none"
        />

        {open && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
            <CommandList className="max-h-72">
              {results.map((product) => {
                const stock = stockLabel(product)
                return (
                  <CommandItem
                    key={product.id}
                    value={product.id}
                    onSelect={() => pick(product)}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {product.sku}
                        {product.barcode ? ` · ${product.barcode}` : ''}
                        {product.taxRate === 0 ? ' · Exento' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums">{formatMoney(product.price, format)}</p>
                      <p className={stock.warn ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                        {stock.text}
                      </p>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandList>

            {loading && results.length === 0 && (
              <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Spinner /> Buscando…
              </p>
            )}
            {failed && (
              <p role="alert" className="px-3 py-4 text-sm text-destructive">
                No se pudo buscar. Intenta de nuevo.
              </p>
            )}
            {showEmpty && (
              <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <PackageSearch className="size-4" aria-hidden />
                {query.trim() ? `Sin resultados para "${query.trim()}"` : 'Aún no hay productos'}
              </p>
            )}
          </div>
        )}
      </Command>
    </div>
  )
}
