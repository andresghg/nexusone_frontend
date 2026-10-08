import { Hammer } from 'lucide-react'
import { Card, CardContent } from '@/shared/components/ui/card'

interface ModulePlaceholderProps {
  title: string
  description: string
}

/**
 * Placeholder genérico para módulos futuros.
 * Un solo componente para todas las rutas "en construcción":
 * el breadcrumb y el sidebar ya funcionan porque vienen de la config.
 */
export default function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <Hammer className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">Módulo en construcción</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            La navegación ya está lista. Cuando este módulo se active, aparecerá aquí
            sin tocar un solo componente del sidebar.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
