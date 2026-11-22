'use client'

import { DataTableToolbar, type ToolbarControl } from '@/shared/components/data-table'
import { ANY_DOCUMENT_TYPE_LABELS } from '../types/billing'
import { INVOICES_QUERY_SPEC, toTableQuery, type InvoicesQuery } from '../utils/invoiceParams'

type Props = { query: InvoicesQuery }

/** Los filtros de documentos, descritos para la barra genérica. */
export function InvoicesToolbar({ query }: Props) {
  const controls: ToolbarControl[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: 'Buscar por número o cliente',
      ariaLabel: 'Buscar documentos',
    },
    {
      type: 'select',
      key: 'period',
      ariaLabel: 'Filtrar por período',
      className: 'w-40',
      options: [
        { value: 'all', label: 'Todo el tiempo' },
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Últimos 7 días' },
        { value: 'month', label: 'Este mes' },
        { value: 'last_month', label: 'Mes pasado' },
      ],
    },
    {
      type: 'select',
      key: 'payment',
      ariaLabel: 'Filtrar por cobro',
      className: 'w-40',
      options: [
        { value: 'all', label: 'Todos los cobros' },
        { value: 'unpaid', label: 'Pendientes' },
        { value: 'overdue', label: 'Vencidos' },
        { value: 'partial', label: 'Pago parcial' },
        { value: 'paid', label: 'Pagados' },
      ],
    },
    {
      type: 'select',
      key: 'type',
      ariaLabel: 'Filtrar por tipo de documento',
      className: 'w-40',
      options: [
        { value: 'all', label: 'Todos los tipos' },
        { value: 'invoice', label: ANY_DOCUMENT_TYPE_LABELS.invoice },
        { value: 'receipt', label: ANY_DOCUMENT_TYPE_LABELS.receipt },
        { value: 'sales_note', label: ANY_DOCUMENT_TYPE_LABELS.sales_note },
        { value: 'credit_note', label: ANY_DOCUMENT_TYPE_LABELS.credit_note },
      ],
    },
    {
      type: 'select',
      key: 'status',
      ariaLabel: 'Filtrar por estado',
      className: 'w-44',
      options: [
        { value: 'all', label: 'Todos los estados' },
        { value: 'issued', label: 'Emitidos' },
        { value: 'void', label: 'Anulados' },
      ],
    },
  ]

  return <DataTableToolbar spec={INVOICES_QUERY_SPEC} query={toTableQuery(query)} controls={controls} />
}
