'use client'

import toast from 'react-hot-toast'
import {
  Archive,
  ArrowLeftRight,
  History,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  DataTable,
  DataTableEmpty,
  type DataTableColumn,
  type RowAction,
} from '@/shared/components/data-table'
import { setProductActiveAction } from '../action/product-action'
import type { ProductRow } from '../types/inventory'
import { formatMoney, formatStock } from '../utils/format'
import { hasActiveFilters, type InventoryQuery } from '../utils/inventoryParams'
import { getStockStatus } from '../utils/stockStatus'

type Props = {
  organizationId: string
  products: ProductRow[]
  query: InventoryQuery
  canWrite: boolean
  onCreate: () => void
  onEdit: (product: ProductRow) => void
  onMovement: (product: ProductRow) => void
  onHistory: (product: ProductRow) => void
}

function ProductCell({ product }: { product: ProductRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{product.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {product.sku}
          {product.categoryName ? ` · ${product.categoryName}` : ''}
        </p>
      </div>
      {!product.active && <Badge variant="secondary">Archivado</Badge>}
    </div>
  )
}

function StockCell({ product }: { product: ProductRow }) {
  const status = getStockStatus(product)

  if (status === 'untracked') {
    return <span className="text-xs text-muted-foreground">Sin control</span>
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {status === 'out' && <Badge variant="destructive">Agotado</Badge>}
      {status === 'low' && (
        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
          Bajo
        </Badge>
      )}
      <span className="tabular-nums">
        {formatStock(product.stock)} <span className="text-xs text-muted-foreground">{product.unit}</span>
      </span>
    </div>
  )
}

const COLUMNS: DataTableColumn<ProductRow>[] = [
  { id: 'product', header: 'Producto', cell: (product) => <ProductCell product={product} /> },
  {
    id: 'price',
    header: 'Precio',
    align: 'right',
    hideBelow: 'md',
    className: 'tabular-nums',
    cell: (product) => formatMoney(product.price),
  },
  { id: 'stock', header: 'Stock', align: 'right', cell: (product) => <StockCell product={product} /> },
]

/** La tabla de productos es solo configuración: columnas, acciones y mensajes. */
export function ProductsTable({
  organizationId,
  products,
  query,
  canWrite,
  onCreate,
  onEdit,
  onMovement,
  onHistory,
}: Props) {
  const setActive = async (product: ProductRow, active: boolean) => {
    try {
      const { error, success } = await setProductActiveAction({
        organizationId,
        productId: product.id,
        active,
      })
      if (error) toast.error(error)
      else toast.success(success)
    } catch {
      toast.error('No se pudo cambiar el estado del producto')
    }
  }

  // Qué ve cada persona depende de sus permisos: aquí se decide qué acciones existen
  const actionsFor = (product: ProductRow): RowAction[] => {
    const actions: RowAction[] = []

    if (canWrite && product.active && product.trackStock) {
      actions.push({
        id: 'movement',
        label: 'Registrar movimiento',
        icon: ArrowLeftRight,
        onSelect: () => onMovement(product),
      })
    }
    if (product.trackStock) {
      actions.push({
        id: 'history',
        label: 'Ver historial',
        icon: History,
        onSelect: () => onHistory(product),
      })
    }
    if (canWrite) {
      actions.push({
        id: 'edit',
        label: 'Editar',
        icon: Pencil,
        separatorBefore: product.trackStock,
        onSelect: () => onEdit(product),
      })
      actions.push(
        product.active
          ? {
              id: 'archive',
              label: 'Archivar',
              icon: Archive,
              variant: 'destructive',
              confirm: {
                title: `¿Archivar ${product.name}?`,
                description:
                  'Dejará de aparecer en la lista y no admitirá movimientos de stock. Su historial se conserva y puedes restaurarlo cuando quieras.',
                confirmLabel: 'Archivar',
              },
              onSelect: () => setActive(product, false),
            }
          : {
              id: 'restore',
              label: 'Restaurar',
              icon: RotateCcw,
              onSelect: () => setActive(product, true),
            },
      )
    }
    return actions
  }

  return (
    <DataTable
      caption="Productos"
      columns={COLUMNS}
      rows={products}
      getRowId={(product) => product.id}
      getRowLabel={(product) => product.name}
      rowActions={actionsFor}
      rowClassName={(product) => !product.active && 'opacity-60'}
      empty={
        <DataTableEmpty
          filtered={hasActiveFilters(query)}
          icon={PackageSearch}
          title="Aún no tienes productos"
          description={
            canWrite
              ? 'Crea tu primer producto para empezar a controlar el stock.'
              : 'Cuando se registren productos, aparecerán aquí.'
          }
          action={
            canWrite && (
              <Button onClick={onCreate}>
                <Plus aria-hidden />
                Nuevo producto
              </Button>
            )
          }
        />
      }
    />
  )
}
