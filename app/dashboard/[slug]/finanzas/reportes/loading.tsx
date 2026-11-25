import { Skeleton } from '@/shared/components/ui/skeleton'

// Mientras se consultan los reportes: la misma silueta que la pantalla (título, pestañas, cifras y gráfico)
export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-busy="true" aria-label="Cargando reportes">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton className="col-span-2 h-24 lg:col-span-1" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}
