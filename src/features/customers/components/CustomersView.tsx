'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { DataTablePagination } from '@/shared/components/data-table'
import { Button } from '@/shared/components/ui/button'
import type { CustomerRow } from '../types/customers'
import { CUSTOMERS_QUERY_SPEC, toTableQuery, type CustomersQuery } from '../utils/customerParams'
import { CustomerFormSheet } from './CustomerFormSheet'
import { CustomersTable } from './CustomersTable'
import { CustomersToolbar } from './CustomersToolbar'

type Props = {
  organizationId: string
  customers: CustomerRow[]
  total: number
  query: CustomersQuery
  pageSize: number
  canWrite: boolean
}

export function CustomersView({ organizationId, customers, total, query, pageSize, canWrite }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<CustomerRow | null>(null)

  const openForm = (customer: CustomerRow | null) => {
    setEditing(customer)
    setFormKey((key) => key + 1) // formulario nuevo en cada apertura: no arrastra valores anteriores
    setFormOpen(true)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Las personas y empresas a las que facturas</p>
        </div>

        {canWrite && (
          <Button onClick={() => openForm(null)}>
            <Plus aria-hidden />
            Nuevo cliente
          </Button>
        )}
      </header>

      <CustomersToolbar query={query} />

      <CustomersTable
        organizationId={organizationId}
        customers={customers}
        query={query}
        canWrite={canWrite}
        onCreate={() => openForm(null)}
        onEdit={openForm}
      />

      <DataTablePagination
        spec={CUSTOMERS_QUERY_SPEC}
        query={toTableQuery(query)}
        total={total}
        pageSize={pageSize}
      />

      {canWrite && (
        <CustomerFormSheet
          key={formKey}
          open={formOpen}
          onOpenChange={setFormOpen}
          organizationId={organizationId}
          customer={editing}
        />
      )}
    </div>
  )
}
