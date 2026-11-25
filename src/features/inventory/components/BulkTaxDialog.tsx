'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
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
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group'
import { Spinner } from '@/shared/components/ui/spinner'
import { setProductsTaxRateAction } from '../action/product-action'
import { BULK_TAX_MAX_PRODUCTS } from '../schemas/inventorySchema'
import type { CategoryRow } from '../types/inventory'
import { applyLabel, customRateError, describeScope, taxRateInput, type TaxMode } from '../utils/bulkTax'
import type { DisplayFormat } from '../utils/format'
import { toFilters, type InventoryQuery } from '../utils/inventoryParams'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  query: InventoryQuery // la lista que se está viendo: es exactamente lo que se va a cambiar
  total: number // cuántos productos tiene esa lista
  categories: CategoryRow[]
  display: DisplayFormat
}

const OPTIONS: { value: TaxMode; label: string; hint: string }[] = [
  { value: 'exempt', label: 'Exento (0 %)', hint: 'No se les cobra impuesto al facturar.' },
  { value: 'default', label: 'Tasa de la empresa', hint: 'Usan el impuesto general de la configuración de facturación.' },
  { value: 'custom', label: 'Otra tasa', hint: 'Una tasa propia para estos productos.' },
]

export function BulkTaxDialog({ open, onOpenChange, organizationId, query, total, categories, display }: Props) {
  const [mode, setMode] = useState<TaxMode | null>(null) // sin opción elegida de entrada: un cambio masivo es explícito
  const [custom, setCustom] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const tooMany = total > BULK_TAX_MAX_PRODUCTS
  const rateError = mode === 'custom' ? customRateError(custom) : null
  const canApply = mode !== null && rateError === null && total > 0 && !tooMany && !submitting

  const apply = async () => {
    if (!mode || !canApply) return
    setSubmitting(true)
    try {
      const { error, success } = await setProductsTaxRateAction({
        organizationId,
        filters: toFilters(query),
        taxRate: taxRateInput(mode, custom),
        expectedCount: total, // el total que la persona vio: si cambió, el servidor no toca nada
      })
      if (error) {
        toast.error(error)
        return
      }
      toast.success(success)
      onOpenChange(false)
    } catch {
      toast.error('No se pudo actualizar el impuesto de los productos')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambiar el impuesto en lote</DialogTitle>
          <DialogDescription>
            Se aplica a los {total} producto{total === 1 ? '' : 's'} de la lista que estás viendo. ¿Solo algunos?
            Filtra antes por categoría o búsqueda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ul aria-label="Filtros de la lista" className="flex flex-wrap gap-1.5">
            {describeScope(query, categories).map((item) => (
              <li key={item}>
                <Badge variant="outline">{item}</Badge>
              </li>
            ))}
          </ul>

          <RadioGroup
            aria-label="Impuesto"
            value={mode ?? ''}
            onValueChange={(value) => setMode(value as TaxMode)}
            className="gap-3"
          >
            {OPTIONS.map((option) => (
              <div key={option.value} className="flex items-start gap-3 rounded-lg border p-3">
                <RadioGroupItem value={option.value} id={`bulk-tax-${option.value}`} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor={`bulk-tax-${option.value}`} className="font-medium">
                    {option.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{option.hint}</p>
                  {option.value === 'custom' && mode === 'custom' && (
                    <div className="space-y-1 pt-1">
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-28 text-right tabular-nums"
                        placeholder="Ej. 10"
                        aria-label="Tasa de impuesto en %"
                        aria-invalid={custom !== '' && rateError ? true : undefined}
                        aria-describedby={custom !== '' && rateError ? 'bulk-tax-error' : undefined}
                        value={custom}
                        onChange={(event) => setCustom(event.target.value)}
                      />
                      {custom !== '' && rateError && (
                        <p id="bulk-tax-error" role="alert" className="text-xs text-destructive">
                          {rateError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </RadioGroup>

          {tooMany ? (
            <p role="alert" className="text-sm text-destructive">
              Son demasiados productos para cambiarlos juntos (máximo {BULK_TAX_MAX_PRODUCTS.toLocaleString(display.locale)}).
              Filtra la lista y vuelve a intentarlo.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Los documentos ya emitidos no cambian. Quien esté armando una factura con estos productos tendrá que
              volver a agregarlos.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={apply} disabled={!canApply}>
            {submitting && <Spinner />}
            {mode ? applyLabel(mode, custom, total) : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
