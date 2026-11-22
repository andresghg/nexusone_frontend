'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Spinner } from '@/shared/components/ui/spinner'
import { Textarea } from '@/shared/components/ui/textarea'
import { formatQuantity, toMilli } from '@/features/inventory/utils/stockMath'
import { issueCreditNoteAction } from '../action/invoice-action'
import { ANY_DOCUMENT_TYPE_LABELS } from '../types/billing'
import type { CreditableItem, CreditContext, InvoiceListDisplay } from '../types/invoice'
import { draftToLines, emptyDraft, fullDraft, previewCreditNote, type CreditDraft } from '../utils/creditNoteDraft'
import { formatDocumentNumber } from '../utils/documentNumber'
import { formatMoney } from '../utils/formatMoney'
import { fromMinorUnits, toMinorUnits } from '../utils/minorUnits'

type Props = {
  organizationId: string
  context: CreditContext
  display: InvoiceListDisplay
  basePath: string // /dashboard/<slug>/pos/facturacion: de aquí salen los enlaces al documento y a la nota nueva
}

const REASON_SUGGESTIONS = [
  'Devolución de productos',
  'Error en el precio o la cantidad',
  'Descuento posterior a la venta',
]
const MAX_REASON = 200

const newKey = () => crypto.randomUUID()

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex items-baseline justify-between gap-4 border-t pt-3' : 'flex justify-between gap-4'}>
      <dt className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
      <dd className={strong ? 'text-xl font-semibold tabular-nums' : 'tabular-nums'}>{value}</dd>
    </div>
  )
}

export function CreditNoteForm({ organizationId, context, display, basePath }: Props) {
  const router = useRouter()
  const { invoice } = context
  // Una clave por pantalla abierta: un doble clic o un reintento de red no emiten dos notas
  const [idempotencyKey] = useState(newKey)
  const [draft, setDraft] = useState<CreditDraft>(() => emptyDraft(context))
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const format = { currency: invoice.currency, locale: display.locale, decimals: invoice.currencyDecimals }
  const money = (value: number) => formatMoney(value, format)
  const documentLabel = `${ANY_DOCUMENT_TYPE_LABELS[invoice.documentType]} ${formatDocumentNumber(display.documentPrefixes, invoice.documentType, invoice.number)}`
  const hasAvailable = context.items.some((item) => item.remainingQuantity > 0)

  const preview = useMemo(() => previewCreditNote(context, draft), [context, draft])
  const total = preview.totals?.total ?? 0
  const trimmedReason = reason.trim()
  const reasonError = trimmedReason.length < 3 ? 'Indica el motivo de la nota de crédito' : null
  const hasLineErrors = Object.keys(preview.lineErrors).length > 0
  const canSubmit = preview.totals !== null && !hasLineErrors && reasonError === null && !submitting

  // Saldo del documento DESPUÉS de la nota (en unidades mínimas, sin errores de coma flotante)
  const decimals = invoice.currencyDecimals
  const balanceAfter = fromMinorUnits(
    (toMinorUnits(invoice.balance, decimals) ?? 0) - (toMinorUnits(total, decimals) ?? 0),
    decimals,
  )

  const setLine = (itemId: string, patch: Partial<CreditDraft[string]>) =>
    setDraft((current) => ({ ...current, [itemId]: { ...current[itemId], ...patch } }))

  const review = () => {
    setTouched(true)
    if (canSubmit) setConfirming(true)
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      const response = await issueCreditNoteAction({
        organizationId,
        invoiceId: invoice.id,
        reason: trimmedReason,
        idempotencyKey,
        lines: draftToLines(context, draft),
      })
      if (response.error) {
        toast.error(response.error)
        setConfirming(false)
        return
      }
      toast.success(response.success)
      router.push(response.creditNote ? `${basePath}/${response.creditNote.id}` : `${basePath}/${invoice.id}`)
    } catch {
      toast.error('No se pudo emitir la nota de crédito')
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  const balanceMessage =
    balanceAfter > 0
      ? `Saldo pendiente del documento: ${money(balanceAfter)}`
      : balanceAfter === 0
        ? 'El documento queda sin saldo pendiente'
        : `Saldo a favor del cliente: ${money(-balanceAfter)}`

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <section aria-labelledby="credit-lines-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="credit-lines-heading" className="text-sm font-semibold">
                ¿Qué se acredita?
              </h2>
              <p className="text-sm text-muted-foreground">
                Escribe la cantidad de cada línea. El monto sale del precio y descuento de {documentLabel}.
              </p>
            </div>
            {hasAvailable && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft((current) => fullDraft(context, current))}
                >
                  Acreditar todo lo disponible
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(emptyDraft(context))}>
                  Limpiar
                </Button>
              </div>
            )}
          </div>

          <ul aria-label="Líneas del documento original" className="divide-y rounded-lg border">
            {context.items.map((item) => (
              <LineRow
                key={item.itemId}
                item={item}
                value={draft[item.itemId]}
                error={preview.lineErrors[item.itemId]}
                credited={preview.lineTotals[item.itemId]}
                money={money}
                onChange={(patch) => setLine(item.itemId, patch)}
              />
            ))}
          </ul>
        </section>

        <section aria-labelledby="credit-reason-heading" className="space-y-2">
          <Label id="credit-reason-heading" htmlFor="credit-reason" className="text-sm font-semibold">
            Motivo
          </Label>
          <Textarea
            id="credit-reason"
            rows={3}
            maxLength={MAX_REASON}
            value={reason}
            placeholder="Ej. El cliente devolvió dos unidades en buen estado"
            aria-invalid={touched && reasonError ? true : undefined}
            aria-describedby={touched && reasonError ? 'credit-reason-error' : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {touched && reasonError && (
            <p id="credit-reason-error" role="alert" className="text-xs text-destructive">
              {reasonError}
            </p>
          )}
          <div className="flex flex-wrap gap-2" aria-label="Motivos frecuentes" role="group">
            {REASON_SUGGESTIONS.map((suggestion) => (
              <Button key={suggestion} type="button" variant="outline" size="sm" onClick={() => setReason(suggestion)}>
                {suggestion}
              </Button>
            ))}
          </div>
        </section>
      </div>

      <aside aria-label="Resumen de la nota de crédito" className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen</h2>
          <div aria-live="polite" className="space-y-3 text-sm">
            {preview.totals ? (
              <dl className="space-y-2">
                <Row label="Neto" value={money(preview.totals.subtotal)} />
                {preview.totals.taxBreakdown
                  .filter((row) => row.rate > 0)
                  .map((row) => (
                    <Row key={row.rate} label={`${invoice.taxName} ${row.rate}%`} value={money(row.tax)} />
                  ))}
                <Row label="Total de la nota" value={money(preview.totals.total)} strong />
              </dl>
            ) : (
              <p className="text-muted-foreground">Elige cuánto acreditar de cada línea.</p>
            )}
            {preview.error && <p className="text-xs text-destructive">{preview.error}</p>}
          </div>

          {preview.totals && (
            <div className="space-y-1 border-t pt-3 text-sm">
              <p className={balanceAfter < 0 ? 'font-medium' : 'text-muted-foreground'}>{balanceMessage}</p>
              {balanceAfter < 0 && (
                <p className="text-xs text-muted-foreground">La devolución del dinero se registra fuera del sistema.</p>
              )}
              {preview.restockCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {preview.restockCount === 1 ? '1 línea vuelve' : `${preview.restockCount} líneas vuelven`} al
                  inventario.
                </p>
              )}
            </div>
          )}
        </div>

        {/* En pantallas angostas la acción queda fija abajo; en escritorio acompaña al resumen */}
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t bg-background px-4 py-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <Button type="button" className="w-full" disabled={submitting} onClick={review}>
            Revisar y emitir
          </Button>
          {touched && !canSubmit && !submitting && (
            <p role="alert" className="text-xs text-destructive">
              {hasLineErrors
                ? 'Corrige las cantidades marcadas.'
                : preview.totals === null
                  ? 'Elige al menos una línea para acreditar.'
                  : reasonError}
            </p>
          )}
        </div>
      </aside>

      <Dialog open={confirming} onOpenChange={(next) => !submitting && setConfirming(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir nota de crédito</DialogTitle>
            <DialogDescription>
              Acreditarás {money(total)} sobre {documentLabel}. {balanceMessage}. Una nota emitida no se puede anular.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
              Volver
            </Button>
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting && <Spinner />}
              Emitir nota de crédito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LineRow({
  item,
  value,
  error,
  credited,
  money,
  onChange,
}: {
  item: CreditableItem
  value: CreditDraft[string]
  error: string | undefined
  credited: number | undefined
  money: (value: number) => string
  onChange: (patch: Partial<CreditDraft[string]>) => void
}) {
  const qty = (n: number) => `${formatQuantity(toMilli(n))} ${item.unit}`
  const done = item.remainingQuantity <= 0
  const inputId = `credit-qty-${item.itemId}`
  const errorId = `credit-qty-error-${item.itemId}`

  return (
    <li className={done ? 'space-y-1 p-4 opacity-60' : 'space-y-3 p-4'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{item.description}</p>
          <p className="text-xs text-muted-foreground">
            {item.sku && `${item.sku} · `}Facturado {qty(item.quantity)}
            {item.creditedQuantity > 0 && ` · Ya acreditado ${qty(item.creditedQuantity)}`}
            {!done && ` · Disponible ${qty(item.remainingQuantity)}`}
          </p>
        </div>
        {done ? (
          <span className="text-xs text-muted-foreground">Acreditada por completo</span>
        ) : (
          <span className="text-sm tabular-nums text-muted-foreground">Disponible {money(item.remainingTotal)}</span>
        )}
      </div>

      {!done && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="space-y-1">
            <Label htmlFor={inputId} className="text-xs">
              Cantidad a acreditar
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={inputId}
                inputMode="decimal"
                autoComplete="off"
                className="w-28 text-right tabular-nums"
                value={value?.quantity ?? ''}
                placeholder="0"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                aria-label={`Cantidad a acreditar de ${item.description}`}
                onChange={(event) => onChange({ quantity: event.target.value })}
              />
              <span className="text-sm text-muted-foreground">{item.unit}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Acreditar todo lo disponible de ${item.description}`}
                onClick={() => onChange({ quantity: String(item.remainingQuantity) })}
              >
                Todo
              </Button>
            </div>
          </div>

          {item.tracksStock && (
            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id={`credit-restock-${item.itemId}`}
                checked={value?.restock ?? false}
                onCheckedChange={(checked) => onChange({ restock: checked === true })}
              />
              <Label htmlFor={`credit-restock-${item.itemId}`} className="text-sm font-normal">
                Devolver al inventario
              </Label>
            </div>
          )}

          {credited !== undefined && (
            <p className="ml-auto pb-2 text-sm font-medium tabular-nums" aria-label={`Se acreditan ${money(credited)}`}>
              −{money(credited)}
            </p>
          )}
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}
