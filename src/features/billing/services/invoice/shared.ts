import type { db } from '@/db'
import type { InvoiceListRow } from '../../types/invoice'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type Pagination = { page: number; pageSize: number }
export type InvoicePageResult = { rows: InvoiceListRow[]; total: number }

// Escapa los comodines de LIKE para que "50%" busque literalmente "50%".
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')
