'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/shared/components/ui/button'
import { buildTableQuery, type QuerySpec, type TableQuery } from '@/lib/table-query'

type Props = {
  spec: QuerySpec
  query: TableQuery
  total: number
  pageSize: number
}

/** "1–25 de 120" con Anterior / Siguiente. Son enlaces: funcionan sin JavaScript y se pueden compartir. */
export function DataTablePagination({ spec, query, total, pageSize }: Props) {
  const pathname = usePathname()
  if (total === 0) return null

  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const from = (query.page - 1) * pageSize + 1
  const to = Math.min(query.page * pageSize, total)
  const href = (page: number) => `${pathname}${buildTableQuery({ ...query, page }, spec)}`

  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {from}–{to} de {total}
      </p>

      <div className="flex gap-2">
        {query.page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(query.page - 1)}>Anterior</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Anterior
          </Button>
        )}

        {query.page < lastPage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(query.page + 1)}>Siguiente</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Siguiente
          </Button>
        )}
      </div>
    </nav>
  )
}
