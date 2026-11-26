'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group'
import type { DisplayFormat } from '@/features/billing/types/billing'
import type { DateRange, ReportData } from '../types/report'
import { calendarDate } from '../utils/reportFormat'
import {
  buildReportsQuery,
  REPORT_PERIODS,
  REPORT_PERIOD_LABELS,
  REPORT_TABS,
  REPORT_TAB_LABELS,
  type ReportPeriod,
  type ReportsQuery,
  type ReportTab,
} from '../utils/reportParams'
import { rangeError } from '../utils/reportRange'
import { ExportMenu } from './ExportMenu'
import { PaymentsTab } from './PaymentsTab'
import { ProductsTab } from './ProductsTab'
import { ReceivablesTab } from './ReceivablesTab'
import { SalesTab } from './SalesTab'

type Props = {
  query: ReportsQuery
  range: DateRange // el período ya resuelto con el "hoy" de la empresa
  today: string
  display: DisplayFormat
  data: ReportData
  companyName: string // para el encabezado de lo que se imprime o descarga
  print?: (html: string) => void
}

export function ReportsView({ query, range, today, display, data, companyName, print }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  // Fechas del período personalizado: se escriben aquí y solo se consulta cuando forman un rango válido
  const [from, setFrom] = useState(query.from || range.from)
  const [to, setTo] = useState(query.to || range.to)
  const customError = query.period === 'personalizado' ? rangeError({ from, to }) : null

  const navigate = (patch: Partial<ReportsQuery>) =>
    startTransition(() => router.push(`${pathname}${buildReportsQuery({ ...query, ...patch })}`))

  const changePeriod = (period: ReportPeriod) => {
    if (period === 'personalizado') navigate({ period, from: range.from, to: range.to })
    else navigate({ period })
    if (period === 'personalizado') {
      setFrom(range.from)
      setTo(range.to)
    }
  }

  const changeDate = (key: 'from' | 'to', value: string) => {
    const next = { from, to, [key]: value }
    setFrom(next.from)
    setTo(next.to)
    if (rangeError(next) === null) navigate({ period: 'personalizado', from: next.from, to: next.to })
  }

  const showPeriod = query.tab !== 'cobrar' // lo que se debe es "hoy", no depende de un período
  const sameDay = range.from === range.to
  const rangeText = sameDay
    ? `El ${calendarDate(range.from, display.locale)}`
    : `Del ${calendarDate(range.from, display.locale)} al ${calendarDate(range.to, display.locale)}`

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Ventas, productos, cobros y cuentas por cobrar de tu empresa. Los montos están en {display.currency}.
          </p>
        </div>
        <ExportMenu
          data={data}
          companyName={companyName}
          excelHref={`${pathname}/exportar${buildReportsQuery(query)}`}
          print={print}
        />
      </header>

      <Tabs value={query.tab} onValueChange={(tab) => navigate({ tab: tab as ReportTab })} className="space-y-4">
        <TabsList className="w-full sm:w-fit">
          {REPORT_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="flex-1 sm:flex-none">
              {REPORT_TAB_LABELS[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="space-y-3">
          {showPeriod ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="report-period" className="text-xs">
                  Período
                </Label>
                <Select value={query.period} onValueChange={(value) => changePeriod(value as ReportPeriod)}>
                  <SelectTrigger id="report-period" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_PERIODS.map((period) => (
                      <SelectItem key={period} value={period}>
                        {REPORT_PERIOD_LABELS[period]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {query.period === 'personalizado' && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="report-from" className="text-xs">
                      Desde
                    </Label>
                    <Input
                      id="report-from"
                      type="date"
                      value={from}
                      max={today}
                      aria-invalid={customError ? true : undefined}
                      aria-describedby={customError ? 'report-range-error' : undefined}
                      onChange={(event) => changeDate('from', event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="report-to" className="text-xs">
                      Hasta
                    </Label>
                    <Input
                      id="report-to"
                      type="date"
                      value={to}
                      max={today}
                      aria-invalid={customError ? true : undefined}
                      aria-describedby={customError ? 'report-range-error' : undefined}
                      onChange={(event) => changeDate('to', event.target.value)}
                    />
                  </div>
                </>
              )}

              {query.tab === 'productos' && (
                <div className="space-y-1">
                  <span id="report-rank-label" className="block text-xs font-medium">
                    Ordenar por
                  </span>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="report-rank-label"
                    value={query.rank}
                    onValueChange={(rank) => rank && navigate({ rank: rank as ReportsQuery['rank'] })}
                  >
                    <ToggleGroupItem value="importe">Importe</ToggleGroupItem>
                    <ToggleGroupItem value="cantidad">Cantidad</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Lo que se debe hoy, al {calendarDate(today, display.locale)}.</p>
          )}

          {customError && (
            <p id="report-range-error" role="alert" className="text-xs text-destructive">
              {customError}
            </p>
          )}
          {showPeriod && !customError && <p className="text-xs text-muted-foreground">{rangeText}</p>}
        </div>

        <p role="status" className="sr-only">
          {pending ? 'Actualizando el reporte…' : ''}
        </p>

        {REPORT_TABS.map((tab) => (
          <TabsContent key={tab} value={tab} aria-busy={pending} className={pending ? 'opacity-60 transition-opacity' : ''}>
            {data.tab === tab && <ReportBody data={data} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function ReportBody({ data }: { data: ReportData }) {
  if ('error' in data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{data.error}</AlertDescription>
      </Alert>
    )
  }
  switch (data.tab) {
    case 'ventas':
      return <SalesTab report={data.report} />
    case 'productos':
      return <ProductsTab report={data.report} />
    case 'cobros':
      return <PaymentsTab report={data.report} />
    case 'cobrar':
      return <ReceivablesTab report={data.report} />
  }
}
