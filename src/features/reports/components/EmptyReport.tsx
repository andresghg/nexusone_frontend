import type { ReactNode } from 'react'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/components/ui/empty'

/** Estado vacío de un reporte: dice por qué no hay nada y qué hacer, en vez de dejar un gráfico en blanco. */
export function EmptyReport({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {children && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  )
}
