'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { DataTablePagination } from '@/shared/components/data-table'
import { Button } from '@/shared/components/ui/button'
import type { InvoiceListDisplay, InvoiceListRow } from '../types/invoice'
import { formatDocumentNumber } from '../utils/documentNumber'
import { INVOICES_QUERY_SPEC, toTableQuery, type InvoicesQuery } from '../utils/invoiceParams'
import { InvoicesTable } from './InvoicesTable'
import { InvoicesToolbar } from './InvoicesToolbar'
import { VoidInvoiceDialog } from './VoidInvoiceDialog'

type Props = {
  organizationId: string
  invoices: InvoiceListRow[]
  display: InvoiceListDisplay
  total: number
  query: InvoicesQuery
  pageSize: number
  canCreate: boolean
  canVoid: boolean
  basePath: string
}

export function InvoicesView({
  organizationId,
  invoices,
  display,
  total,
  query,
  pageSize,
  canCreate,
  canVoid,
  basePath,
}: Props) {
  const [voiding, setVoiding] = useState<InvoiceListRow | null>(null)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
          <p className="mt-1 text-sm text-muted-foreground">Documentos emitidos y su estado de cobro</p>
        </div>

        {canCreate && (
          <Button asChild>
            <Link href={`${basePath}/nueva`}>
              <Plus aria-hidden />
              Nueva factura
            </Link>
          </Button>
        )}
      </header>

      <InvoicesToolbar query={query} />

      <InvoicesTable
        invoices={invoices}
        display={display}
        query={query}
        canCreate={canCreate}
        canVoid={canVoid}
        basePath={basePath}
        onVoid={setVoiding}
      />

      <DataTablePagination
        spec={INVOICES_QUERY_SPEC}
        query={toTableQuery(query)}
        total={total}
        pageSize={pageSize}
      />

      {canVoid && voiding && (
        <VoidInvoiceDialog
          key={voiding.id} // formulario nuevo para cada documento: no arrastra el motivo anterior
          open
          onOpenChange={(open) => !open && setVoiding(null)}
          organizationId={organizationId}
          invoiceId={voiding.id}
          documentLabel={formatDocumentNumber(display.documentPrefixes, voiding.documentType, voiding.number)}
        />
      )}
    </div>
  )
}
