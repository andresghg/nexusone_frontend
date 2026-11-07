'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { cn } from '@/lib/utils'
import type { Breakpoint, DataTableColumn, RowAction } from './types'

// Clases completas (no armadas con texto): Tailwind solo genera las que ve escritas.
const HIDE_BELOW: Record<Breakpoint, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}
const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const

const columnClass = <T,>(column: DataTableColumn<T>) =>
  cn(column.align && ALIGN[column.align], column.hideBelow && HIDE_BELOW[column.hideBelow], column.className)

type Props<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  /** Nombre legible de la fila, para el lector de pantalla ("Acciones de Cola 1L"). */
  getRowLabel: (row: T) => string
  /** Acciones del menú de cada fila. Sin acciones, la fila no muestra menú. */
  rowActions?: (row: T) => RowAction[]
  rowClassName?: (row: T) => string | false | undefined
  /** Qué mostrar cuando no hay filas (normalmente un <DataTableEmpty />). */
  empty: ReactNode
  caption?: string
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  getRowLabel,
  rowActions,
  rowClassName,
  empty,
  caption,
}: Props<T>) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<RowAction | null>(null)

  if (rows.length === 0) return <>{empty}</>

  // Una acción asíncrona deja el menú deshabilitado hasta que termine
  const run = (action: RowAction) => {
    const result = action.onSelect()
    if (result instanceof Promise) {
      startTransition(async () => {
        await result
      })
    }
  }

  const select = (action: RowAction) => (action.confirm ? setConfirming(action) : run(action))

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.id} className={columnClass(column)}>
                  {column.header}
                </TableHead>
              ))}
              {rowActions && (
                <TableHead className="w-12">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => {
              const actions = rowActions?.(row) ?? []
              return (
                <TableRow key={getRowId(row)} className={cn(rowClassName?.(row))}>
                  {columns.map((column) => (
                    <TableCell key={column.id} className={columnClass(column)}>
                      {column.cell(row)}
                    </TableCell>
                  ))}

                  {rowActions && (
                    <TableCell className="text-right">
                      {actions.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={pending}
                              aria-label={`Acciones de ${getRowLabel(row)}`}
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.map((action) => (
                              <ActionItem key={action.id} action={action} onSelect={select} />
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) run(confirming)
                setConfirming(null)
              }}
            >
              {confirming?.confirm?.confirmLabel ?? 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ActionItem({
  action,
  onSelect,
}: {
  action: RowAction
  onSelect: (action: RowAction) => void
}) {
  const Icon = action.icon
  return (
    <>
      {action.separatorBefore && <DropdownMenuSeparator />}
      <DropdownMenuItem variant={action.variant} onSelect={() => onSelect(action)}>
        {Icon && <Icon aria-hidden />}
        {action.label}
      </DropdownMenuItem>
    </>
  )
}
