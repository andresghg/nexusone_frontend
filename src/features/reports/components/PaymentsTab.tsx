import { PAYMENT_METHOD_LABELS } from '@/features/billing/types/billing'
import { formatMoney } from '@/features/billing/utils/formatMoney'
import type { PaymentsReport } from '../types/report'
import { averagePayment } from '../utils/paymentsMath'
import { percentOf } from '../utils/reportFormat'
import { EmptyReport } from './EmptyReport'
import { KpiCard } from './KpiCard'

export function PaymentsTab({ report }: { report: PaymentsReport }) {
  const { display } = report
  const money = (value: number) =>
    formatMoney(value, { currency: display.currency, locale: display.locale, decimals: display.currencyDecimals })

  if (report.payments === 0) {
    return (
      <EmptyReport title="No hay cobros en este período">
        Aquí aparece el dinero que se cobró, por forma de pago. Prueba con otro período.
      </EmptyReport>
    )
  }

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3">
        <KpiCard
          featured
          label="Cobrado"
          value={money(report.total)}
          detail={`${report.payments} cobro${report.payments === 1 ? '' : 's'} en el período`}
        />
        <KpiCard
          label="Cobro promedio"
          value={money(averagePayment(report.total, report.payments, display.currencyDecimals))}
          detail="Monto cobrado ÷ cantidad de cobros"
        />
      </dl>

      <section aria-labelledby="methods-heading" className="space-y-2">
        <h2 id="methods-heading" className="text-sm font-semibold">
          Por forma de pago
        </h2>
        <ul aria-label="Cobros por forma de pago" className="divide-y rounded-lg border">
          {report.methods.map((row) => (
            <li key={row.method} className="space-y-1.5 p-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{PAYMENT_METHOD_LABELS[row.method]}</span>
                <span className="tabular-nums">{money(row.amount)}</span>
              </div>
              <div className="flex items-center gap-3">
                <div aria-hidden className="h-1.5 flex-1 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percentOf(row.amount, report.total)}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                  {row.payments} cobro{row.payments === 1 ? '' : 's'} · {percentOf(row.amount, report.total)} %
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Cuenta los cobros por la fecha en que se cobraron, no por la del documento. Los cobros anulados no suman, y las
          devoluciones de dinero (que se hacen fuera del sistema) no se descuentan.
        </p>
      </section>
    </div>
  )
}
