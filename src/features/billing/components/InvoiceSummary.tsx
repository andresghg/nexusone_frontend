import type { CalcResult } from '../utils/calculateInvoice'
import { formatMoney, type MoneyFormat } from '../utils/formatMoney'

type Props = {
  result: CalcResult
  hasLines: boolean
  format: MoneyFormat
  taxName: string
  pricesIncludeTax: boolean
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex items-baseline justify-between gap-4 border-t pt-3' : 'flex justify-between gap-4'}>
      <dt className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
      <dd className={strong ? 'text-xl font-semibold tabular-nums' : 'tabular-nums'}>{value}</dd>
    </div>
  )
}

/** Totales del documento en vivo, calculados con las mismas reglas que usará el servidor al emitir. */
export function InvoiceSummary({ result, hasLines, format, taxName, pricesIncludeTax }: Props) {
  const money = (value: number) => formatMoney(value, format)

  return (
    <div aria-live="polite" className="space-y-3">
      {result.ok ? (
        <dl className="space-y-2 text-sm">
          <Row label="Neto" value={money(result.totals.subtotal)} />
          {result.totals.discountTotal > 0 && (
            <Row label="Descuentos" value={`-${money(result.totals.discountTotal)}`} />
          )}
          {result.totals.taxBreakdown
            .filter((row) => row.rate > 0)
            .map((row) => (
              <Row key={row.rate} label={`${taxName} ${row.rate}%`} value={money(row.tax)} />
            ))}
          <Row label="Total" value={money(result.totals.total)} strong />
        </dl>
      ) : (
        <dl className="space-y-2 text-sm">
          <Row label="Total" value={hasLines ? '—' : money(0)} strong />
        </dl>
      )}

      {!result.ok && hasLines && <p className="text-xs text-destructive">{result.error}</p>}

      <p className="text-xs text-muted-foreground">
        {pricesIncludeTax ? 'Los precios ya incluyen el impuesto.' : 'El impuesto se suma al precio.'}
      </p>
    </div>
  )
}
