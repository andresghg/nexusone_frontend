import { ArrowRight, DollarSign, Package, ReceiptText, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppLink } from '@/lib/router-adapter'

const kpis = [
  { label: 'Ventas de hoy', value: '$1,284,500', icon: DollarSign, delta: '+12% vs. ayer' },
  { label: 'Facturas emitidas', value: '47', icon: ReceiptText, delta: '+8 esta semana' },
  { label: 'Productos activos', value: '312', icon: Package, delta: '3 con stock bajo' },
  { label: 'Ticket promedio', value: '$27,300', icon: TrendingUp, delta: '+4.2% mensual' },
]

/** Panel de inicio: demuestra el área de contenido junto a la navegación. */
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Buenos días, Ana</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen de tu operación — martes 18 de agosto
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className="size-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">{kpi.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.delta}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <AppLink
            href="/pos/facturacion/nueva"
            className="group flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-accent"
          >
            <div>
              <p className="text-sm font-medium">Nueva factura</p>
              <p className="text-xs text-muted-foreground">Crea y cobra en menos de un minuto</p>
            </div>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </AppLink>
          <AppLink
            href="/pos/inventario"
            className="group flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-accent"
          >
            <div>
              <p className="text-sm font-medium">Revisar inventario</p>
              <p className="text-xs text-muted-foreground">3 productos necesitan reposición</p>
            </div>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </AppLink>
        </CardContent>
      </Card>
    </div>
  )
}
