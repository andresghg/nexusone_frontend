import { formatMoney } from '@/features/billing/utils/formatMoney'
import { formatStock } from '@/features/inventory/utils/format'
import type { TopProductsReport } from '../types/report'
import { EmptyReport } from './EmptyReport'

export function ProductsTab({ report }: { report: TopProductsReport }) {
  const { display, products, rank } = report
  const money = (value: number) =>
    formatMoney(value, { currency: display.currency, locale: display.locale, decimals: display.currencyDecimals })

  if (products.length === 0) {
    return (
      <EmptyReport title="Sin productos vendidos en este período">
        No hay ventas en estas fechas, o lo vendido quedó totalmente acreditado con notas de crédito.
      </EmptyReport>
    )
  }

  // La barra es solo una ayuda visual: el número exacto siempre está escrito al lado
  const measure = (product: (typeof products)[number]) => (rank === 'quantity' ? product.quantity : product.total)
  const max = Math.max(...products.map(measure))

  return (
    <section aria-labelledby="top-products-heading" className="space-y-3">
      <div>
        <h2 id="top-products-heading" className="text-sm font-semibold">
          {rank === 'quantity' ? 'Más vendidos por cantidad' : 'Más vendidos por importe'}
        </h2>
        <p className="text-xs text-muted-foreground">
          Descuentan lo acreditado con notas de crédito. Importes con impuesto.
        </p>
      </div>

      <ol aria-label="Productos más vendidos" className="divide-y rounded-lg border">
        {products.map((product, index) => (
          <li key={product.productId ?? `libre-${product.description}`} className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{product.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.sku ?? 'Concepto libre'} · {formatStock(product.quantity, display)} {product.unit}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-right font-medium tabular-nums">{money(product.total)}</p>
            </div>
            <div aria-hidden className="ml-8 h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${max > 0 ? Math.max(2, Math.round((measure(product) / max) * 100)) : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
