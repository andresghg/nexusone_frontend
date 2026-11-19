'use client'

import { DataTableToolbar, type ToolbarControl } from '@/shared/components/data-table'
import { CUSTOMERS_QUERY_SPEC, toTableQuery, type CustomersQuery } from '../utils/customerParams'

type Props = { query: CustomersQuery }

/** Los filtros de clientes, descritos para la barra genérica. */
export function CustomersToolbar({ query }: Props) {
  const controls: ToolbarControl[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: 'Buscar por nombre, RUT o correo',
      ariaLabel: 'Buscar clientes',
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
  ]

  return <DataTableToolbar spec={CUSTOMERS_QUERY_SPEC} query={toTableQuery(query)} controls={controls} />
}
