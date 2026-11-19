'use client'

import { useMemo, useReducer, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Spinner } from '@/shared/components/ui/spinner'
import { Textarea } from '@/shared/components/ui/textarea'
import { CustomerFormSheet } from '@/features/customers/components/CustomerFormSheet'
import type { CustomerOption } from '@/features/customers/types/customers'
import { issueInvoiceAction } from '../action/invoice-action'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type BillingSettings,
  type DocumentType,
  type PaymentMethod,
} from '../types/billing'
import type { ProductOption } from '../types/invoice'
import {
  computeDraft,
  draftReducer,
  stockShortages,
  toIssueInput,
} from '../utils/invoiceDraft'
import { CustomerPicker } from './CustomerPicker'
import { InvoiceLines } from './InvoiceLines'
import { InvoiceSummary } from './InvoiceSummary'
import { ProductPicker } from './ProductPicker'

type Props = {
  organizationId: string
  settings: Pick<
    BillingSettings,
    | 'currency'
    | 'currencyDecimals'
    | 'locale'
    | 'taxName'
    | 'taxRate'
    | 'pricesIncludeTax'
    | 'allowNegativeStock'
    | 'defaultDueDays'
  >
  today: string // YYYY-MM-DD en la zona horaria de la empresa: el vencimiento no puede ser anterior
  listHref: string
  canAdjust: boolean // descuentos e impuesto por línea
  canCreateCustomer: boolean
}

const newKey = () => crypto.randomUUID()

export function NewInvoiceForm({ organizationId, settings, today, listHref, canAdjust, canCreateCustomer }: Props) {
  const router = useRouter()
  const [lines, dispatch] = useReducer(draftReducer, [])
  const [documentType, setDocumentType] = useState<DocumentType>('invoice')
  const [customer, setCustomer] = useState<CustomerOption | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [paid, setPaid] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  // Una clave por documento: un doble clic o un reintento no emiten dos veces (el servidor la reconoce)
  const [idempotencyKey] = useState(newKey)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState('')
  const [customerSheet, setCustomerSheet] = useState({ open: false, version: 0 })

  const format = useMemo(
    () => ({ currency: settings.currency, locale: settings.locale, decimals: settings.currencyDecimals }),
    [settings.currency, settings.locale, settings.currencyDecimals],
  )
  const result = useMemo(() => computeDraft(lines, settings), [lines, settings])
  const shortages = useMemo(() => stockShortages(lines, settings.allowNegativeStock), [lines, settings.allowNegativeStock])

  const canSubmit = lines.length > 0 && result.ok && !submitting && !done
  const dueHint =
    settings.defaultDueDays > 0
      ? `Si lo dejas vacío: a ${settings.defaultDueDays} días.`
      : 'Si lo dejas vacío: al contado.'

  const addProduct = (product: ProductOption) => dispatch({ type: 'add-product', product, key: newKey() })

  const submit = async () => {
    if (!canSubmit) return
    setServerError('')
    setSubmitting(true)
    try {
      const response = await issueInvoiceAction({
        ...toIssueInput(lines, {
          documentType,
          customerId: customer?.id ?? null,
          dueDate,
          notes,
          paid,
          paymentMethod,
          idempotencyKey,
        }),
        organizationId,
      })
      if (response.error) {
        setServerError(response.error)
        setSubmitting(false)
        return
      }
      setDone(true) // el botón queda bloqueado mientras se va a la lista
      toast.success(response.success)
      router.push(listHref)
    } catch {
      setServerError('No se pudo emitir el documento. Revisa tu conexión e inténtalo de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <section aria-labelledby="products-heading" className="min-w-0 space-y-4">
        <h2 id="products-heading" className="text-sm font-semibold">
          Productos
        </h2>
        <ProductPicker organizationId={organizationId} format={format} onPick={addProduct} />
        <InvoiceLines
          lines={lines}
          lineTotals={result.ok ? result.lines : null}
          shortages={shortages}
          format={format}
          taxName={settings.taxName}
          defaultTaxRate={settings.taxRate}
          canAdjust={canAdjust}
          newKey={newKey}
          dispatch={dispatch}
        />
      </section>

      <aside aria-label="Datos del documento" className="space-y-5 lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="document-type">Tipo de documento</Label>
            <Select value={documentType} onValueChange={(value) => setDocumentType(value as DocumentType)}>
              <SelectTrigger id="document-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {DOCUMENT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <CustomerPicker
              organizationId={organizationId}
              value={customer}
              onChange={setCustomer}
              onCreate={canCreateCustomer ? () => setCustomerSheet((s) => ({ open: true, version: s.version + 1 })) : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="due-date">Vencimiento</Label>
            <Input id="due-date" type="date" min={today} value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-describedby="due-hint" />
            <p id="due-hint" className="text-xs text-muted-foreground">
              {dueHint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="paid" checked={paid} onCheckedChange={(checked) => setPaid(checked === true)} />
            <Label htmlFor="paid">Cobrado al emitir</Label>
          </div>

          {paid && (
            <div className="space-y-1.5">
              <Label htmlFor="payment-method">Método de pago</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                <SelectTrigger id="payment-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <InvoiceSummary
            result={result}
            hasLines={lines.length > 0}
            format={format}
            taxName={settings.taxName}
            pricesIncludeTax={settings.pricesIncludeTax}
          />

          {shortages.size > 0 && (
            <p role="status" className="text-xs text-destructive">
              Hay productos con más unidades de las disponibles. Si el stock cambió, el sistema lo comprobará al emitir.
            </p>
          )}
          {serverError && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {submitting && <Spinner />}
            Emitir {DOCUMENT_TYPE_LABELS[documentType].toLowerCase()}
          </Button>
        </div>
      </aside>

      {canCreateCustomer && (
        <CustomerFormSheet
          key={customerSheet.version} // formulario nuevo en cada apertura
          open={customerSheet.open}
          onOpenChange={(open) => setCustomerSheet((s) => ({ ...s, open }))}
          organizationId={organizationId}
          customer={null}
          onCreated={setCustomer}
        />
      )}
    </form>
  )
}
