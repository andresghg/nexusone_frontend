'use client'

import Link from 'next/link'
import { Ban, Plus, ReceiptText } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  DataTable,
  DataTableEmpty,
  type DataTableColumn,
  type RowAction,
} from '@/shared/components/data-table'
import { ANY_DOCUMENT_TYPE_LABELS } from '../types/billing'
import type { InvoiceListDisplay, InvoiceListRow } from '../types/invoice'
import { formatCalendarDate, formatIssuedDate } from '../utils/formatDate'
import { formatDocumentNumber } from '../utils/documentNumber'
import { formatMoney } from '../utils/formatMoney'
import { fromMinorUnits, toMinorUnits } from '../utils/minorUnits'
import { hasActiveFilters, type InvoicesQuery } from '../utils/invoiceParams'
import { invoiceBadge } from '../utils/invoiceStatus'

type Props = {
  invoices: InvoiceListRow[]
  display: InvoiceListDisplay
  query: InvoicesQuery
  canCreate: boolean
  canVoid: boolean
  basePath: string // /dashboard/<slug>/pos/facturacion: de aquí salen los enlaces al detalle y a "nueva"
  onVoid: (invoice: InvoiceListRow) => void
}

/** Número visible del documento: "F-000012". */
const labelOf = (row: InvoiceListRow, display: InvoiceListDisplay) =>
  formatDocumentNumber(display.documentPrefixes, row.documentType, row.number)

// Insignia del estado y, debajo, lo que importa del cobro. Se usa en la columna "Estado" (escritorio)
// y bajo el monto (móvil), donde no hay espacio para una columna más.
function StatusInfo({
  row,
  display,
  showReason,
  align = 'start',
}: {
  row: InvoiceListRow
  display: InvoiceListDisplay
  showReason: boolean
  align?: 'start' | 'end'
}) {
  const badge = invoiceBadge(row)
  return (
    <div className={align === 'end' ? 'flex min-w-0 flex-col items-end gap-1' : 'min-w-0 space-y-1'}>
      <Badge variant={badge.variant}>{badge.label}</Badge>
      {showReason && row.status === 'void' && row.voidReason && (
        <p className="max-w-48 truncate text-xs text-muted-foreground" title={row.voidReason}>
          {row.voidReason}
        </p>
      )}
      {row.status === 'issued' && row.paymentStatus === 'partial' && (
        <p className="text-xs text-muted-foreground">
          Saldo{' '}
          {formatMoney(
            fromMinorUnits(
              (toMinorUnits(row.total, row.currencyDecimals) ?? 0) -
                (toMinorUnits(row.creditTotal, row.currencyDecimals) ?? 0) -
                (toMinorUnits(row.paidTotal, row.currencyDecimals) ?? 0),
              row.currencyDecimals,
            ),
            { currency: row.currency, locale: display.locale, decimals: row.currencyDecimals },
          )}
        </p>
      )}
      {row.status === 'issued' && row.documentType !== 'credit_note' && row.paymentStatus !== 'paid' && row.dueDate && (
        <p className={row.overdue ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          Vence {formatCalendarDate(row.dueDate, display.locale)}
        </p>
      )}
    </div>
  )
}

function buildColumns(display: InvoiceListDisplay, basePath: string): DataTableColumn<InvoiceListRow>[] {
  return [
    {
      id: 'document',
      header: 'Documento',
      cell: (row) => (
        <div className="min-w-0">
          <Link href={`${basePath}/${row.id}`} className="font-medium tabular-nums hover:underline">
            {labelOf(row, display)}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {ANY_DOCUMENT_TYPE_LABELS[row.documentType]} · {formatIssuedDate(row.issuedAt, display)}
          </p>
          {/* En pantallas angostas el cliente va aquí, porque su columna se oculta */}
          <p className="truncate text-xs text-muted-foreground md:hidden">{row.customerName ?? 'Sin cliente'}</p>
        </div>
      ),
    },
    {
      id: 'customer',
      header: 'Cliente',
      hideBelow: 'md',
      cell: (row) =>
        row.customerName ? (
          <div className="min-w-0">
            <p className="truncate">{row.customerName}</p>
            {row.customerTaxId && <p className="truncate text-xs text-muted-foreground">{row.customerTaxId}</p>}
          </div>
        ) : (
          <span className="text-muted-foreground">Sin cliente</span>
        ),
    },
    {
      id: 'status',
      header: 'Estado',
      hideBelow: 'md',
      cell: (row) => <StatusInfo row={row} display={display} showReason />,
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      cell: (row) => (
        <div className="flex flex-col items-end gap-1">
          <span className={row.status === 'void' ? 'tabular-nums line-through' : 'font-medium tabular-nums'}>
            {/* Una nota de crédito resta: el signo evita confundirla con una venta */}
            {row.documentType === 'credit_note' && '−'}
            {formatMoney(row.total, { currency: row.currency, locale: display.locale, decimals: row.currencyDecimals })}
          </span>
          {row.documentType !== 'credit_note' && row.creditTotal > 0 && (
            <span className="text-xs text-muted-foreground">
              Acreditado{' '}
              {formatMoney(row.creditTotal, { currency: row.currency, locale: display.locale, decimals: row.currencyDecimals })}
            </span>
          )}
          <div className="md:hidden">
            <StatusInfo row={row} display={display} showReason={false} align="end" />
          </div>
        </div>
      ),
    },
  ]
}

/** La tabla de documentos es solo configuración: columnas, acciones y mensajes. */
export function InvoicesTable({ invoices, display, query, canCreate, canVoid, basePath, onVoid }: Props) {
  // Qué ve cada persona depende de sus permisos: solo se puede anular lo emitido
  const actionsFor = (invoice: InvoiceListRow): RowAction[] => {
    // Una nota de crédito y un documento que ya tiene notas no se anulan (la base también lo impide)
    if (!canVoid || invoice.status !== 'issued' || invoice.documentType === 'credit_note' || invoice.creditTotal > 0) return []
    return [
      {
        id: 'void',
        label: 'Anular',
        icon: Ban,
        variant: 'destructive',
        onSelect: () => onVoid(invoice),
      },
    ]
  }

  return (
    <DataTable
      caption="Documentos"
      columns={buildColumns(display, basePath)}
      rows={invoices}
      getRowId={(invoice) => invoice.id}
      getRowLabel={(invoice) => labelOf(invoice, display)}
      rowActions={actionsFor}
      rowClassName={(invoice) => invoice.status === 'void' && 'opacity-60'}
      empty={
        <DataTableEmpty
          filtered={hasActiveFilters(query)}
          icon={ReceiptText}
          title="Aún no has emitido documentos"
          description={
            canCreate
              ? 'Emite tu primera factura y la verás aquí con su estado de cobro.'
              : 'Cuando se emitan documentos, aparecerán aquí.'
          }
          action={
            canCreate && (
              <Button asChild>
                <Link href={`${basePath}/nueva`}>
                  <Plus aria-hidden />
                  Nueva factura
                </Link>
              </Button>
            )
          }
        />
      }
    />
  )
}
