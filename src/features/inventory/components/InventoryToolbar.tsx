'use client'

import { AlertTriangle } from 'lucide-react'
import { DataTableToolbar, type ToolbarControl } from '@/shared/components/data-table'
import type { CategoryRow } from '../types/inventory'
import { INVENTORY_QUERY_SPEC, toTableQuery, type InventoryQuery } from '../utils/inventoryParams'

type Props = { query: InventoryQuery; categories: CategoryRow[] }

/** Los filtros del inventario, descritos para la barra genérica. */
export function InventoryToolbar({ query, categories }: Props) {
  const controls: ToolbarControl[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: 'Buscar por nombre, SKU o código',
      ariaLabel: 'Buscar productos',
    },
    {
      type: 'select',
      key: 'category',
      ariaLabel: 'Filtrar por categoría',
      emptyOption: 'Todas las categorías',
      options: categories.map((category) => ({ value: category.id, label: category.name })),
    },
    {
      type: 'select',
      key: 'status',
      ariaLabel: 'Filtrar por estado',
      className: 'w-36',
      options: [
        { value: 'active', label: 'Activos' },
        { value: 'archived', label: 'Archivados' },
        { value: 'all', label: 'Todos' },
      ],
    },
    { type: 'toggle', key: 'low', label: 'Stock bajo', icon: AlertTriangle },
  ]

  return (
    <DataTableToolbar spec={INVENTORY_QUERY_SPEC} query={toTableQuery(query)} controls={controls} />
  )
}
