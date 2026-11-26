'use client'

import { useState } from 'react'
import { Percent, Plus, Tags } from 'lucide-react'
import { DataTablePagination } from '@/shared/components/data-table'
import { Button } from '@/shared/components/ui/button'
import { getProductHistoryAction } from '../action/stock-action'
import type { CategoryRow, HistoryResult, ProductRow } from '../types/inventory'
import { INVENTORY_QUERY_SPEC, toTableQuery, type InventoryQuery } from '../utils/inventoryParams'
import { BulkTaxDialog } from './BulkTaxDialog'
import { CategoriesDialog } from './CategoriesDialog'
import type { DisplayFormat } from '../utils/format'
import { HistorySheet } from './HistorySheet'
import { InventoryToolbar } from './InventoryToolbar'
import { MovementDialog } from './MovementDialog'
import { ProductFormSheet } from './ProductFormSheet'
import { ProductsTable } from './ProductsTable'

type Props = {
  organizationId: string
  products: ProductRow[]
  total: number
  categories: CategoryRow[]
  query: InventoryQuery
  pageSize: number
  canWrite: boolean
  display: DisplayFormat // moneda, idioma y zona horaria de la empresa
}

export function InventoryView({
  display,
  organizationId,
  products,
  total,
  categories,
  query,
  pageSize,
  canWrite,
}: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [bulkTaxOpen, setBulkTaxOpen] = useState(false)
  const [bulkTaxKey, setBulkTaxKey] = useState(0)
  const [movementProduct, setMovementProduct] = useState<ProductRow | null>(null)
  const [movementKey, setMovementKey] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<{
    product: ProductRow
    promise: Promise<HistoryResult>
  } | null>(null)

  const openForm = (product: ProductRow | null) => {
    setEditing(product)
    setFormKey((key) => key + 1) // formulario nuevo en cada apertura: no arrastra valores anteriores
    setFormOpen(true)
  }

  const openMovement = (product: ProductRow) => {
    setMovementProduct(product)
    setMovementKey((key) => key + 1) // diálogo nuevo en cada apertura: sin valores del movimiento anterior
  }

  // Cada apertura pide el historial de nuevo: siempre refleja los últimos movimientos
  const openHistory = (product: ProductRow) => {
    setHistory({
      product,
      promise: getProductHistoryAction({ organizationId, productId: product.id }),
    })
    setHistoryOpen(true)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">Productos, stock y categorías de tu empresa</p>
        </div>

        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <Tags aria-hidden />
              Categorías
            </Button>
            {total > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setBulkTaxKey((key) => key + 1) // diálogo nuevo en cada apertura: sin la opción de la vez anterior
                  setBulkTaxOpen(true)
                }}
              >
                <Percent aria-hidden />
                Impuesto en lote
              </Button>
            )}
            <Button onClick={() => openForm(null)}>
              <Plus aria-hidden />
              Nuevo producto
            </Button>
          </div>
        )}
      </header>

      <InventoryToolbar query={query} categories={categories} />

      <ProductsTable
        organizationId={organizationId}
        products={products}
        query={query}
        canWrite={canWrite}
        display={display}
        onCreate={() => openForm(null)}
        onEdit={openForm}
        onMovement={openMovement}
        onHistory={openHistory}
      />

      <DataTablePagination
        spec={INVENTORY_QUERY_SPEC}
        query={toTableQuery(query)}
        total={total}
        pageSize={pageSize}
      />

      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        product={history?.product ?? null}
        history={history?.promise ?? null}
        display={display}
      />

      {canWrite && movementProduct && (
        <MovementDialog
          key={`movement-${movementKey}`}
          open
          onOpenChange={(open) => !open && setMovementProduct(null)}
          organizationId={organizationId}
          product={movementProduct}
          display={display}
        />
      )}

      {canWrite && (
        <>
          <ProductFormSheet
            key={`product-form-${formKey}`}
            open={formOpen}
            onOpenChange={setFormOpen}
            organizationId={organizationId}
            categories={categories}
            product={editing}
            currency={display.currency}
          />
          <BulkTaxDialog
            key={`bulk-tax-${bulkTaxKey}`}
            open={bulkTaxOpen}
            onOpenChange={setBulkTaxOpen}
            organizationId={organizationId}
            query={query}
            total={total}
            categories={categories}
            display={display}
          />
          <CategoriesDialog
            key={`categories-${categoriesOpen}`}
            open={categoriesOpen}
            onOpenChange={setCategoriesOpen}
            organizationId={organizationId}
            categories={categories}
          />
        </>
      )}
    </div>
  )
}
