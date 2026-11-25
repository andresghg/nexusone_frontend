import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: string
  detail?: ReactNode // línea secundaria: cómo se compone o con qué se compara
  tone?: 'default' | 'warning' // "warning" para lo que pide atención (por ejemplo, lo vencido)
  featured?: boolean // la cifra principal de la pantalla
}

/** Una cifra con su etiqueta. La etiqueta va primero en el HTML: así un lector de pantalla dice qué es antes del número. */
export function KpiCard({ label, value, detail, tone = 'default', featured = false }: Props) {
  return (
    <div className={cn('rounded-lg border p-4', featured && 'bg-muted/40', tone === 'warning' && 'border-destructive/40')}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-semibold tabular-nums tracking-tight',
          featured ? 'text-3xl' : 'text-2xl',
          tone === 'warning' && 'text-destructive',
        )}
      >
        {value}
      </dd>
      {detail && <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd>}
    </div>
  )
}
