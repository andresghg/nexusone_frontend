'use client'

import toast from 'react-hot-toast'
import { Archive, Pencil, Plus, RotateCcw, Users } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  DataTable,
  DataTableEmpty,
  type DataTableColumn,
  type RowAction,
} from '@/shared/components/data-table'
import { setCustomerActiveAction } from '../action/customer-action'
import type { CustomerRow } from '../types/customers'
import { hasActiveFilters, type CustomersQuery } from '../utils/customerParams'

type Props = {
  organizationId: string
  customers: CustomerRow[]
  query: CustomersQuery
  canWrite: boolean
  onCreate: () => void
  onEdit: (customer: CustomerRow) => void
}

function CustomerCell({ customer }: { customer: CustomerRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{customer.name}</p>
        <p className="truncate text-xs text-muted-foreground">{customer.taxId ?? 'Sin RUT'}</p>
      </div>
      {!customer.active && <Badge variant="secondary">Archivado</Badge>}
    </div>
  )
}

function ContactCell({ customer }: { customer: CustomerRow }) {
  if (!customer.email && !customer.phone) return <span className="text-muted-foreground">—</span>
  return (
    <div className="min-w-0">
      {customer.email && <p className="truncate">{customer.email}</p>}
      {customer.phone && <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>}
    </div>
  )
}

const COLUMNS: DataTableColumn<CustomerRow>[] = [
  { id: 'customer', header: 'Cliente', cell: (customer) => <CustomerCell customer={customer} /> },
  { id: 'contact', header: 'Contacto', hideBelow: 'md', cell: (customer) => <ContactCell customer={customer} /> },
]

/** La tabla de clientes es solo configuración: columnas, acciones y mensajes. */
export function CustomersTable({ organizationId, customers, query, canWrite, onCreate, onEdit }: Props) {
  const setActive = async (customer: CustomerRow, active: boolean) => {
    try {
      const { error, success } = await setCustomerActiveAction({
        organizationId,
        customerId: customer.id,
        active,
      })
      if (error) toast.error(error)
      else toast.success(success)
    } catch {
      toast.error('No se pudo cambiar el estado del cliente')
    }
  }

  // Qué ve cada persona depende de sus permisos: aquí se decide qué acciones existen
  const actionsFor = (customer: CustomerRow): RowAction[] => {
    if (!canWrite) return []

    return [
      { id: 'edit', label: 'Editar', icon: Pencil, onSelect: () => onEdit(customer) },
      customer.active
        ? {
            id: 'archive',
            label: 'Archivar',
            icon: Archive,
            variant: 'destructive',
            confirm: {
              title: `¿Archivar a ${customer.name}?`,
              description:
                'Dejará de aparecer en la lista y no podrás elegirlo en facturas nuevas. Sus facturas anteriores se conservan y puedes restaurarlo cuando quieras.',
              confirmLabel: 'Archivar',
            },
            onSelect: () => setActive(customer, false),
          }
        : {
            id: 'restore',
            label: 'Restaurar',
            icon: RotateCcw,
            onSelect: () => setActive(customer, true),
          },
    ]
  }

  return (
    <DataTable
      caption="Clientes"
      columns={COLUMNS}
      rows={customers}
      getRowId={(customer) => customer.id}
      getRowLabel={(customer) => customer.name}
      rowActions={actionsFor}
      rowClassName={(customer) => !customer.active && 'opacity-60'}
      empty={
        <DataTableEmpty
          filtered={hasActiveFilters(query)}
          icon={Users}
          title="Aún no tienes clientes"
          description={
            canWrite
              ? 'Registra a tus clientes para asociarlos a tus facturas.'
              : 'Cuando se registren clientes, aparecerán aquí.'
          }
          action={
            canWrite && (
              <Button onClick={onCreate}>
                <Plus aria-hidden />
                Nuevo cliente
              </Button>
            )
          }
        />
      }
    />
  )
}
