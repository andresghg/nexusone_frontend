import { ArrowRight, DollarSign, ReceiptText, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { AppLink } from '@/lib/router-adapter'
import { formatMoney } from '@/features/billing/utils/formatMoney'
import type { DashboardSummary } from '@/features/reports/types/report'
import { compareToYesterday, plural } from '@/features/reports/utils/dashboardText'
import { longDate } from '@/features/reports/utils/reportFormat'
import { cn } from '@/lib/utils'

type Props = {
  summary: DashboardSummary
  basePath: string // /dashboard/<slug>: de aquí salen los enlaces
  inventory: { activeProducts: number; lowStock: number } | null // null: sin permiso de inventario
  canViewReports: boolean
}

const linkClass =
  'group flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const arrow = 'size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5'

/** Panel de inicio: cómo va el día y qué requiere atención, con las cifras reales de la empresa. */
export default function DashboardPage({ summary, basePath, inventory, canViewReports }: Props) {
  const { display } = summary
  const money = (value: number) =>
    formatMoney(value, { currency: display.currency, locale: display.locale, decimals: display.currencyDecimals })
  const { receivables } = summary

  const kpis = [
    {
      label: 'Ventas de hoy',
      value: money(summary.today.netTotal),
      icon: DollarSign,
      detail: compareToYesterday(summary.today.netTotal, summary.yesterday.netTotal, money),
    },
    {
      label: 'Documentos emitidos hoy',
      value: String(summary.today.documents),
      icon: ReceiptText,
      detail: `${plural(summary.week.documents, 'documento', 'documentos')} en los últimos 7 días`,
    },
    {
      label: 'Ticket promedio del mes',
      value: money(summary.month.averageTicket),
      icon: TrendingUp,
      detail: `${plural(summary.month.documents, 'documento', 'documentos')} · ventas netas ${money(summary.month.netTotal)}`,
    },
    {
      label: 'Por cobrar',
      value: money(receivables.total),
      icon: Wallet,
      detail: receivables.overdue > 0 ? `${money(receivables.overdue)} vencido` : 'Nada vencido',
      warning: receivables.overdue > 0,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel Principal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumen de tu operación — {longDate(summary.asOf, display.locale)}
          </p>
        </div>
        {canViewReports && (
          <AppLink
            href={`${basePath}/finanzas/reportes`}
            className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            Ver reportes
            <ArrowRight className="size-4" aria-hidden />
          </AppLink>
        )}
      </div>

      <ul aria-label="Cifras del día" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <li key={kpi.label}>
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                <kpi.icon className="size-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">{kpi.value}</p>
                <p className={cn('mt-1 text-xs', kpi.warning ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                  {kpi.detail}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <AppLink href={`${basePath}/pos/facturacion/nueva`} className={linkClass}>
            <div>
              <p className="text-sm font-medium">Nueva factura</p>
              <p className="text-xs text-muted-foreground">Crea y cobra en menos de un minuto</p>
            </div>
            <ArrowRight className={arrow} aria-hidden />
          </AppLink>
          {inventory && (
            <AppLink href={`${basePath}/pos/inventario`} className={linkClass}>
              <div>
                <p className="text-sm font-medium">Revisar inventario</p>
                <p className={cn('text-xs', inventory.lowStock > 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                  {inventory.lowStock > 0
                    ? `${plural(inventory.lowStock, 'producto necesita', 'productos necesitan')} reposición`
                    : 'Sin productos con stock bajo'}
                  {' · '}
                  <span className="font-normal text-muted-foreground">{plural(inventory.activeProducts, 'producto activo', 'productos activos')}</span>
                </p>
              </div>
              <ArrowRight className={arrow} aria-hidden />
            </AppLink>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
