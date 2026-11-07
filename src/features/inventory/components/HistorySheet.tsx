'use client'

import { Suspense, use } from 'react'
import { Badge } from '@/shared/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { HISTORY_LIMIT, type HistoryResult, type MovementType, type ProductRow } from '../types/inventory'
import { formatDateTime, formatStock } from '../utils/format'

const TYPE_LABEL: Record<MovementType, string> = {
  in: 'Entrada',
  out: 'Salida',
  adjustment: 'Ajuste',
}

function HistoryList({ history, unit }: { history: Promise<HistoryResult>; unit: string }) {
  // `use` espera la promesa mientras <Suspense> muestra el esqueleto
  const { error, items } = use(history)

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )
  }

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aún no hay movimientos.</p>
  }

  return (
    <>
      <ul className="divide-y">
        {items.map((movement) => (
          <li key={movement.id} className="space-y-1 py-3">
            <div className="flex items-center justify-between gap-3">
              <Badge variant={movement.type === 'adjustment' ? 'outline' : 'secondary'}>
                {TYPE_LABEL[movement.type]}
              </Badge>
              <span
                className={cn(
                  'font-medium tabular-nums',
                  movement.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                )}
              >
                {movement.delta > 0 ? '+' : ''}
                {formatStock(movement.delta)} {unit}
              </span>
            </div>
            {movement.reason && <p className="text-sm">{movement.reason}</p>}
            <p className="text-xs text-muted-foreground">
              {movement.userName ?? 'Usuario desconocido'} · {formatDateTime(movement.createdAt)}
            </p>
          </li>
        ))}
      </ul>
      {items.length >= HISTORY_LIMIT && (
        <p className="pt-3 text-xs text-muted-foreground">Se muestran los últimos {HISTORY_LIMIT} movimientos.</p>
      )}
    </>
  )
}

function HistorySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando historial">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  )
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: ProductRow | null
  history: Promise<HistoryResult> | null
}

export function HistorySheet({ open, onOpenChange, product, history }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Historial de stock</SheetTitle>
          <SheetDescription>{product ? `${product.name} · ${product.sku}` : ''}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {history && (
            <Suspense fallback={<HistorySkeleton />}>
              <HistoryList history={history} unit={product?.unit ?? ''} />
            </Suspense>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
