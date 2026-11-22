'use client'

import { useId, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/button'
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
import { Switch } from '@/shared/components/ui/switch'
import { updateBillingSettingsAction } from '../action/billing-settings-action'
import { BillingSettingsSchema, type BillingSettingsFormValues } from '../schemas/billingSettingsSchema'
import {
  ANY_DOCUMENT_TYPE_LABELS,
  CREDIT_NOTE_TYPE,
  DOCUMENT_TYPES,
  type AnyDocumentType,
  type BillingSettings,
} from '../types/billing'
import { documentPrefix, formatDocumentNumber } from '../utils/documentNumber'
import { currencyDefaultDecimals, formatMoney } from '../utils/formatMoney'
import {
  CURRENCY_SUGGESTIONS,
  LOCALE_SUGGESTIONS,
  TIMEZONE_SUGGESTIONS,
} from '../utils/settingsOptions'
import { buildPreview } from '../utils/settingsPreview'

type Props = {
  organizationId: string
  settings: BillingSettings
}

const DECIMAL_OPTIONS = [
  { value: 0, label: 'Sin decimales' },
  { value: 1, label: '1 decimal' },
  { value: 2, label: '2 decimales' },
] as const

const PREFIX_PATTERN = /^[A-Z0-9]{1,5}$/

// Atributos de accesibilidad de un campo: marca el error y enlaza el mensaje (error o ayuda).
const describe = (id: string, error?: string, hint?: string) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error || hint ? `${id}-msg` : undefined,
})

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="grid gap-4 py-6 md:grid-cols-[15rem_1fr] md:gap-10">
      <div>
        <h2 id={headingId} className="text-sm font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-desc`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch id={id} aria-describedby={`${id}-desc`} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

type PreviewProps = {
  currency: string
  locale: string
  decimals: number
  taxName: string
  taxRate: number
  pricesIncludeTax: boolean
}

// Muestra el efecto real de la configuración con un producto de ejemplo, calculado con las
// mismas reglas que un documento.
function Preview({ currency, locale, decimals, taxName, taxRate, pricesIncludeTax }: PreviewProps) {
  const headingId = useId()
  const result = buildPreview({ pricesIncludeTax, currencyDecimals: decimals, taxRate })
  const money = (value: number) =>
    formatMoney(value, { currency: currency.trim().toUpperCase(), locale: locale.trim(), decimals })
  const tax = taxName.trim() || 'Impuesto'

  return (
    <div role="group" aria-labelledby={headingId} className="rounded-lg border bg-muted/40 p-4">
      <h3 id={headingId} className="text-sm font-medium">
        Ejemplo con esta configuración
      </h3>
      <div aria-live="polite">
        {result ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              {pricesIncludeTax
                ? `Un producto de ${money(result.price)} ya incluye el impuesto: en el documento se separa en neto e impuesto.`
                : `Un producto de ${money(result.price)} se vende más el impuesto.`}
            </p>
            <dl className="mt-3 space-y-1 text-sm tabular-nums">
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Neto</dt>
                <dd>{money(result.net)}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">
                  {tax} ({taxRate}%)
                </dt>
                <dd>{money(result.tax)}</dd>
              </div>
              <div className="flex justify-between gap-6 border-t pt-1 font-medium">
                <dt>Total a pagar</dt>
                <dd>{money(result.total)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Completa la moneda, los decimales y la tasa del impuesto para ver el ejemplo.
          </p>
        )}
      </div>
    </div>
  )
}

export function BillingSettingsForm({ organizationId, settings }: Props) {
  const router = useRouter()

  // Las empresas anteriores a las notas de crédito no traen su prefijo: se completa con el de fábrica
  const initial = {
    ...settings,
    documentPrefixes: {
      ...settings.documentPrefixes,
      credit_note: documentPrefix(settings.documentPrefixes, CREDIT_NOTE_TYPE),
    },
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BillingSettingsFormValues>({
    resolver: zodResolver(BillingSettingsSchema),
    defaultValues: initial,
  })

  const [currency, decimals, locale, taxName, taxRate, pricesIncludeTax, prefixes] = useWatch({
    control,
    name: [
      'currency',
      'currencyDecimals',
      'locale',
      'taxName',
      'taxRate',
      'pricesIncludeTax',
      'documentPrefixes',
    ],
  })

  const usualDecimals = currencyDefaultDecimals(currency.trim())
  const decimalsHint =
    usualDecimals === null || !/^[A-Za-z]{3}$/.test(currency.trim())
      ? undefined
      : `Para ${currency.trim().toUpperCase()} lo habitual es ${
          usualDecimals === 0 ? 'no usar decimales' : `${usualDecimals} decimales`
        }.`

  const prefixHint = (type: AnyDocumentType) => {
    const prefix = (prefixes?.[type] ?? '').trim().toUpperCase()
    return PREFIX_PATTERN.test(prefix)
      ? `Ejemplo: ${formatDocumentNumber({ [type]: prefix }, type, 1)}`
      : undefined
  }
  const prefixesError = errors.documentPrefixes?.root?.message ?? errors.documentPrefixes?.message

  const onSubmit = handleSubmit(async (values) => {
    const result = await updateBillingSettingsAction({ ...values, organizationId })
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    reset(values) // los valores ya vienen normalizados (moneda y prefijos en mayúsculas)
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="divide-y">
      <Section title="Moneda y formato" description="Cómo se calculan y se muestran los montos de tus documentos.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="currency" label="Moneda" error={errors.currency?.message} hint="Código de 3 letras, ej. CLP o USD.">
            <Input
              id="currency"
              list="currency-options"
              autoComplete="off"
              maxLength={3}
              className="uppercase"
              {...describe('currency', errors.currency?.message, 'Código de 3 letras, ej. CLP o USD.')}
              {...register('currency')}
            />
            <datalist id="currency-options">
              {CURRENCY_SUGGESTIONS.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </Field>

          <Field id="currencyDecimals" label="Decimales" error={errors.currencyDecimals?.message} hint={decimalsHint}>
            <Controller
              control={control}
              name="currencyDecimals"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                  <SelectTrigger
                    id="currencyDecimals"
                    className="w-full"
                    {...describe('currencyDecimals', errors.currencyDecimals?.message, decimalsHint)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DECIMAL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="locale"
            label="Idioma y región"
            error={errors.locale?.message}
            hint="Define cómo se escriben números y fechas."
          >
            <Input
              id="locale"
              list="locale-options"
              autoComplete="off"
              {...describe('locale', errors.locale?.message, 'Define cómo se escriben números y fechas.')}
              {...register('locale')}
            />
            <datalist id="locale-options">
              {LOCALE_SUGGESTIONS.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </Field>

          <Field
            id="timezone"
            label="Zona horaria"
            error={errors.timezone?.message}
            hint="Define la fecha y hora de emisión."
          >
            <Input
              id="timezone"
              list="timezone-options"
              autoComplete="off"
              {...describe('timezone', errors.timezone?.message, 'Define la fecha y hora de emisión.')}
              {...register('timezone')}
            />
            <datalist id="timezone-options">
              {TIMEZONE_SUGGESTIONS.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </Field>
        </div>
      </Section>

      <Section
        title="Impuestos"
        description="El impuesto que se aplica por defecto. Cada línea de un documento puede llevar una tasa distinta o ser exenta."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="taxName" label="Nombre del impuesto" error={errors.taxName?.message}>
            <Input
              id="taxName"
              autoComplete="off"
              placeholder="IVA"
              {...describe('taxName', errors.taxName?.message)}
              {...register('taxName')}
            />
          </Field>
          <Field
            id="taxRate"
            label="Tasa por defecto (%)"
            error={errors.taxRate?.message}
            hint="Usa 0 si no cobras impuesto."
          >
            <Input
              id="taxRate"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              {...describe('taxRate', errors.taxRate?.message, 'Usa 0 si no cobras impuesto.')}
              {...register('taxRate', { valueAsNumber: true })}
            />
          </Field>
        </div>

        <Controller
          control={control}
          name="pricesIncludeTax"
          render={({ field }) => (
            <ToggleRow
              id="pricesIncludeTax"
              label="Los precios ya incluyen el impuesto"
              description="Actívalo si el precio de tus productos es el valor final al público. Desactívalo si el impuesto se suma al precio."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />

        <Preview
          currency={currency}
          locale={locale}
          decimals={decimals}
          taxName={taxName}
          taxRate={taxRate}
          pricesIncludeTax={pricesIncludeTax}
        />
      </Section>

      <Section title="Ventas e inventario" description="Cómo se comportan las ventas respecto al stock y al cobro.">
        <Controller
          control={control}
          name="allowNegativeStock"
          render={({ field }) => (
            <ToggleRow
              id="allowNegativeStock"
              label="Permitir vender sin stock suficiente"
              description="Desactivado, no se puede emitir un documento con más unidades de las que hay. Activado, el stock puede quedar negativo."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />

        <div className="sm:max-w-xs">
          <Field
            id="defaultDueDays"
            label="Plazo de pago por defecto (días)"
            error={errors.defaultDueDays?.message}
            hint="0 significa al contado."
          >
            <Input
              id="defaultDueDays"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              {...describe('defaultDueDays', errors.defaultDueDays?.message, '0 significa al contado.')}
              {...register('defaultDueDays', { valueAsNumber: true })}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Numeración"
        description="Cada tipo de documento lleva su propia numeración correlativa, que empieza en 1."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...DOCUMENT_TYPES, CREDIT_NOTE_TYPE].map((type) => {
            const id = `prefix-${type}`
            const error = errors.documentPrefixes?.[type]?.message
            const hint = prefixHint(type)
            return (
              <Field key={type} id={id} label={ANY_DOCUMENT_TYPE_LABELS[type]} error={error} hint={hint}>
                <Input
                  id={id}
                  autoComplete="off"
                  maxLength={5}
                  className="uppercase"
                  {...describe(id, error, hint)}
                  {...register(`documentPrefixes.${type}`)}
                />
              </Field>
            )
          })}
        </div>
        {prefixesError && (
          <p role="alert" className="text-xs text-destructive">
            {prefixesError}
          </p>
        )}
      </Section>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 bg-background/95 py-3 backdrop-blur">
        <p className="whitespace-nowrap text-sm text-muted-foreground" aria-live="polite">
          {isDirty ? (
            <>
              <span className="sm:hidden">Sin guardar</span>
              <span className="hidden sm:inline">Tienes cambios sin guardar</span>
            </>
          ) : (
            <>
              <span className="sm:hidden">Guardado</span>
              <span className="hidden sm:inline">Todo guardado</span>
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" disabled={!isDirty || isSubmitting} onClick={() => reset()}>
            Descartar
          </Button>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting && <Spinner />}
            Guardar cambios
          </Button>
        </div>
      </div>
    </form>
  )
}
