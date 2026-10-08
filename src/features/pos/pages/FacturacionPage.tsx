import { Plus } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { AppLink } from '@/lib/router-adapter'

interface Invoice {
  id: string
  client: string
  date: string
  total: string
  status: 'Pagada' | 'Pendiente' | 'Vencida'
}

const invoices: Invoice[] = [
  { id: 'F-0047', client: 'Comercial Andina', date: '18 ago', total: '$184,000', status: 'Pagada' },
  { id: 'F-0046', client: 'Café Mirador', date: '18 ago', total: '$62,500', status: 'Pagada' },
  { id: 'F-0045', client: 'Distribuidora Loaiza', date: '17 ago', total: '$940,000', status: 'Pendiente' },
  { id: 'F-0044', client: 'Panadería El Trigal', date: '17 ago', total: '$128,900', status: 'Pagada' },
  { id: 'F-0043', client: 'Ferretería Central', date: '16 ago', total: '$415,200', status: 'Pendiente' },
  { id: 'F-0042', client: 'Tienda La Esquina', date: '15 ago', total: '$76,300', status: 'Vencida' },
]

const statusVariant: Record<Invoice['status'], 'secondary' | 'outline' | 'destructive'> = {
  Pagada: 'secondary',
  Pendiente: 'outline',
  Vencida: 'destructive',
}

/**
 * POS → Facturación. Progressive disclosure: el sidebar solo muestra
 * "Facturación"; las subsecciones (Nueva, Historial, Clientes) viven
 * DENTRO del módulo como tabs/acciones, no como más niveles de menú.
 */
export default function FacturacionPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
          <p className="mt-1 text-sm text-muted-foreground">Facturas, clientes y cobros del POS</p>
        </div>
        <Button asChild className="gap-1.5">
          <AppLink href="/pos/facturacion/nueva">
            <Plus className="size-4" aria-hidden />
            Nueva factura
          </AppLink>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Facturado hoy</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">$1,284,500</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Por cobrar</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">$1,355,200</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vencidas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">1</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facturas recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.id}</TableCell>
                  <TableCell>{inv.client}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{inv.date}</TableCell>
                  <TableCell className="text-right tabular-nums">{inv.total}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
