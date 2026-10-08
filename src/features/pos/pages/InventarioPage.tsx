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

interface Product {
  sku: string
  name: string
  category: string
  stock: number
  min: number
  price: string
}

const products: Product[] = [
  { sku: 'SKU-1042', name: 'Café molido 500g', category: 'Bebidas', stock: 84, min: 20, price: '$18,900' },
  { sku: 'SKU-1038', name: 'Leche entera 1L', category: 'Lácteos', stock: 4, min: 24, price: '$4,200' },
  { sku: 'SKU-1031', name: 'Arroz premium 1kg', category: 'Granos', stock: 156, min: 40, price: '$6,800' },
  { sku: 'SKU-1027', name: 'Aceite vegetal 900ml', category: 'Despensa', stock: 9, min: 15, price: '$12,400' },
  { sku: 'SKU-1019', name: 'Azúcar refinada 1kg', category: 'Despensa', stock: 2, min: 30, price: '$5,100' },
  { sku: 'SKU-1012', name: 'Chocolate en barra', category: 'Snacks', stock: 67, min: 25, price: '$7,900' },
]

function stockBadge(p: Product) {
  if (p.stock <= p.min) return <Badge variant="destructive">Bajo</Badge>
  if (p.stock <= p.min * 1.5) return <Badge variant="outline">Revisar</Badge>
  return <Badge variant="secondary">OK</Badge>
}

/** POS → Inventario: productos, stock y movimientos. */
export default function InventarioPage() {
  const lowStock = products.filter((p) => p.stock <= p.min).length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">Productos, stock y movimientos</p>
        </div>
        <Button className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Nuevo producto
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Productos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{products.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock bajo</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-destructive">{lowStock}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor del inventario</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">$8.4M</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Productos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="hidden text-right md:table-cell">Precio</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.sku}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{p.category}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{p.price}</TableCell>
                  <TableCell className="text-right">{stockBadge(p)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
