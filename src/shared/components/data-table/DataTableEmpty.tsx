'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/shared/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/components/ui/empty'

type Props = {
  /** ¿Hay filtros activos? Cambia el mensaje: "no hay datos" vs. "ningún resultado". */
  filtered: boolean
  icon: LucideIcon
  title: string
  description: string
  /** Botón principal cuando no hay datos (p. ej. "Nuevo producto"). Omítelo si no hay permiso. */
  action?: ReactNode
  filteredTitle?: string
  filteredDescription?: string
}

export function DataTableEmpty({
  filtered,
  icon: Icon,
  title,
  description,
  action,
  filteredTitle = 'Sin resultados',
  filteredDescription = 'Nada coincide con los filtros. Prueba con otros o límpialos.',
}: Props) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Empty className="rounded-lg border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{filtered ? filteredTitle : title}</EmptyTitle>
        <EmptyDescription>{filtered ? filteredDescription : description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {filtered ? (
          <Button variant="outline" onClick={() => router.replace(pathname)}>
            Limpiar filtros
          </Button>
        ) : (
          action
        )}
      </EmptyContent>
    </Empty>
  )
}
