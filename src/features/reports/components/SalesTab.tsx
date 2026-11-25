'use client'

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/shared/components/ui/chart'
import { formatMoney } from '@/features/billing/utils/formatMoney'
import type { SalesReport } from '../types/report'
import { bucketLabel, bucketTick, compactMoney } from '../utils/reportFormat'
import { EmptyReport } from './EmptyReport'
import { KpiCard } from './KpiCard'

const CHART_CONFIG = { net: { label: 'Ventas netas', color: 'hsl(var(--primary))' } } satisfies ChartConfig

export function SalesTab({ report }: { report: SalesReport }) {
  const { display, totals, points, granularity } = report
  const money = (value: number) =>
    formatMoney(value, { currency: display.currency, locale: display.locale, decimals: display.currencyDecimals })
  const unit = granularity === 'day' ? 'día' : 'mes'
  const active = points.filter((point) => point.documents > 0 || point.creditNotes > 0)

  if (active.length === 0) {
    return (
      <EmptyReport title="Sin ventas en este período">
        No se emitió ningún documento entre estas fechas. Prueba con otro período.
      </EmptyReport>
    )
  }

  const data = points.map((point) => ({
    bucket: point.bucket,
    tick: bucketTick(point.bucket, granularity, display.locale),
    net: point.netTotal,
    point,
  }))

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <KpiCard
            featured
            label="Ventas netas"
            value={money(totals.netTotal)}
            detail={`Neto sin impuesto: ${money(totals.netSubtotal)} · Impuesto: ${money(totals.netTax)}`}
          />
        </div>
        <KpiCard label="Documentos emitidos" value={String(totals.documents)} detail={`Ticket promedio ${money(totals.averageTicket)}`} />
        <KpiCard
          label="Notas de crédito"
          value={totals.creditNotes === 0 ? String(0) : `−${money(totals.creditedTotal)}`}
          detail={totals.creditNotes === 0 ? 'Sin devoluciones' : `${totals.creditNotes} emitida${totals.creditNotes === 1 ? '' : 's'}`}
        />
        <KpiCard label="Cobrado" value={money(totals.collected)} detail="Cobros registrados en el período" />
      </dl>

      <section aria-labelledby="sales-chart-heading" className="space-y-2 rounded-lg border p-4">
        <h2 id="sales-chart-heading" className="text-sm font-semibold">
          Ventas netas por {unit}
        </h2>
        <div
          role="img"
          aria-label={`Gráfico de barras de ventas netas por ${unit}. Total del período: ${money(totals.netTotal)}. El detalle exacto está en la tabla de abajo.`}
        >
          <ChartContainer config={CHART_CONFIG} className="h-56 w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tick" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis
                width={52}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => compactMoney(value, display)}
              />
              <ChartTooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                content={({ active: open, payload }) => {
                  const point = open ? (payload?.[0]?.payload as (typeof data)[number] | undefined)?.point : undefined
                  if (!point) return null
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                      <p className="font-medium">{bucketLabel(point.bucket, granularity, display.locale)}</p>
                      <p className="tabular-nums">Ventas netas: {money(point.netTotal)}</p>
                      <p className="text-muted-foreground tabular-nums">
                        {point.documents} documento{point.documents === 1 ? '' : 's'}
                        {point.creditNotes > 0 && ` · −${money(point.creditedTotal)} en notas de crédito`}
                      </p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="net" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((entry) => (
                  <Cell key={entry.bucket} fill={entry.net < 0 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </section>

      <section aria-labelledby="sales-table-heading" className="space-y-2">
        <h2 id="sales-table-heading" className="text-sm font-semibold">
          Detalle por {unit}
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Documentos, notas de crédito y ventas netas por {unit}. Solo se listan los períodos con movimiento.
            </caption>
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {granularity === 'day' ? 'Día' : 'Mes'}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Documentos
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                  Facturado
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                  Notas de crédito
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Ventas netas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map((point) => (
                <tr key={point.bucket}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {bucketLabel(point.bucket, granularity, display.locale)}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{point.documents}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{money(point.invoicedTotal)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
                    {point.creditNotes > 0 ? `−${money(point.creditedTotal)}` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${point.netTotal < 0 ? 'text-destructive' : ''}`}>
                    {money(point.netTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/40 font-medium">
              <tr>
                <th scope="row" className="px-3 py-2 text-left">
                  Total
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{totals.documents}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{money(totals.invoicedTotal)}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
                  {totals.creditNotes > 0 ? `−${money(totals.creditedTotal)}` : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.netTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  )
}
