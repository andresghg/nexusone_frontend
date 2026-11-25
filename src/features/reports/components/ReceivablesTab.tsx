import { Badge } from '@/shared/components/ui/badge'
import { formatMoney } from '@/features/billing/utils/formatMoney'
import { AGING_LABELS, type ReceivablesReport } from '../types/report'
import { calendarDate, percentOf } from '../utils/reportFormat'
import { EmptyReport } from './EmptyReport'
import { KpiCard } from './KpiCard'

export function ReceivablesTab({ report }: { report: ReceivablesReport }) {
  const { display, asOf } = report
  const money = (value: number) =>
    formatMoney(value, { currency: display.currency, locale: display.locale, decimals: display.currencyDecimals })

  if (report.documents === 0) {
    return (
      <EmptyReport title="No hay nada por cobrar">
        Todos los documentos emitidos están cobrados o acreditados al {calendarDate(asOf, display.locale)}.
      </EmptyReport>
    )
  }

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3">
        <KpiCard
          featured
          label="Por cobrar"
          value={money(report.total)}
          detail={`${report.documents} documento${report.documents === 1 ? '' : 's'} con saldo, al ${calendarDate(asOf, display.locale)}`}
        />
        <KpiCard
          label="Vencido"
          value={money(report.overdue)}
          tone={report.overdue > 0 ? 'warning' : 'default'}
          detail={
            report.overdueDocuments === 0
              ? 'Nada vencido'
              : `${report.overdueDocuments} documento${report.overdueDocuments === 1 ? '' : 's'} (${percentOf(report.overdue, report.total)} % de lo que se debe)`
          }
        />
      </dl>

      <section aria-labelledby="aging-heading" className="space-y-2">
        <h2 id="aging-heading" className="text-sm font-semibold">
          Antigüedad de la deuda
        </h2>
        <ul aria-label="Deuda por tramo de atraso" className="divide-y rounded-lg border">
          {report.aging.map((row) => (
            <li key={row.bucket} className="space-y-1.5 p-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={row.bucket === 'current' ? '' : 'font-medium'}>{AGING_LABELS[row.bucket]}</span>
                <span className="tabular-nums">{money(row.amount)}</span>
              </div>
              <div className="flex items-center gap-3">
                <div aria-hidden className="h-1.5 flex-1 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${row.bucket === 'current' ? 'bg-primary' : 'bg-destructive'}`}
                    style={{ width: `${percentOf(row.amount, report.total)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                  {row.documents} doc. · {percentOf(row.amount, report.total)} %
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="debtors-heading" className="space-y-2">
        <h2 id="debtors-heading" className="text-sm font-semibold">
          Quién debe más
        </h2>
        <ul aria-label="Clientes con mayor deuda" className="divide-y rounded-lg border">
          {report.debtors.map((debtor) => {
            const overdue = debtor.oldestDueDate !== null && debtor.oldestDueDate < asOf
            return (
              <li key={`${debtor.customerId ?? 'sin-cliente'}-${debtor.name}`} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{debtor.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {debtor.documents} documento{debtor.documents === 1 ? '' : 's'}
                    </span>
                    {debtor.oldestDueDate && (
                      <span>
                        {overdue ? 'Vencido desde' : 'Vence'} el {calendarDate(debtor.oldestDueDate, display.locale)}
                      </span>
                    )}
                    {overdue && <Badge variant="destructive">Vencido</Badge>}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums">{money(debtor.amount)}</p>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
