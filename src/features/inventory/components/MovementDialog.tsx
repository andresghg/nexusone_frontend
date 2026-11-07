'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
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
import { Spinner } from '@/shared/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group'
import { registerMovementAction } from '../action/stock-action'
import { MovementFormSchema } from '../schemas/inventorySchema'
import type { MovementType, ProductRow } from '../types/inventory'
import { formatStock } from '../utils/format'
import { previewMovement } from '../utils/stockRules'

const TYPES: Record<
  MovementType,
  { label: string; quantity: string; hint: string; submit: string; placeholder: string }
> = {
  in: {
    label: 'Entrada',
    quantity: 'Cantidad que entra',
    hint: 'Compras a proveedores, devoluciones…',
    submit: 'Registrar entrada',
    placeholder: 'Ej: compra a proveedor',
  },
  out: {
    label: 'Salida',
    quantity: 'Cantidad que sale',
    hint: 'Mermas, consumo interno, pérdidas…',
    submit: 'Registrar salida',
    placeholder: 'Ej: consumo interno',
  },
  adjustment: {
    label: 'Ajuste',
    quantity: 'Stock real contado',
    hint: 'Indica lo que contaste: el sistema registra la diferencia.',
    submit: 'Registrar ajuste',
    placeholder: 'Ej: conteo mensual',
  },
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  product: ProductRow
}

export function MovementDialog({ open, onOpenChange, organizationId, product }: Props) {
  const [pending, startTransition] = useTransition()
  const [type, setType] = useState<MovementType>('in')
  const [quantityText, setQuantityText] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({})

  const config = TYPES[type]
  const quantity = quantityText.trim() === '' ? Number.NaN : Number(quantityText)

  // La misma regla que aplica el servidor: se muestra el resultado antes de enviar.
  // El servidor sigue siendo la autoridad (el stock pudo cambiar entretanto).
  const preview = previewMovement(
    { type, quantity, reason },
    { stock: product.stock, trackStock: product.trackStock, active: product.active },
  )

  const submit = () => {
    const parsed = MovementFormSchema.safeParse({ type, quantity, reason })
    if (!parsed.success) {
      const next: { quantity?: string; reason?: string } = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if ((key === 'quantity' || key === 'reason') && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})

    startTransition(async () => {
      const result = await registerMovementAction({
        organizationId,
        productId: product.id,
        ...parsed.data,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.success}. Stock: ${formatStock(result.stock ?? product.stock)} ${product.unit}`)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>
            {product.name} · {product.sku}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            value={type}
            onValueChange={(value) => {
              if (!value) return // un grupo "single" permite deseleccionar: siempre hay un tipo activo
              setType(value as MovementType)
              setErrors({})
            }}
            className="w-full"
            aria-label="Tipo de movimiento"
          >
            {(Object.keys(TYPES) as MovementType[]).map((key) => (
              <ToggleGroupItem key={key} value={key} className="flex-1">
                {TYPES[key].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="space-y-1.5">
            <Label htmlFor="movement-quantity">{config.quantity}</Label>
            <Input
              id="movement-quantity"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              autoFocus
              value={quantityText}
              onChange={(event) => setQuantityText(event.target.value)}
              aria-invalid={!!errors.quantity}
            />
            {errors.quantity ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.quantity}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{config.hint}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="movement-reason">
              Motivo {type === 'adjustment' ? '' : <span className="text-muted-foreground">(opcional)</span>}
            </Label>
            <Input
              id="movement-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={config.placeholder}
              maxLength={200}
              aria-invalid={!!errors.reason}
            />
            {errors.reason && (
              <p role="alert" className="text-xs text-destructive">
                {errors.reason}
              </p>
            )}
          </div>

          <div aria-live="polite" className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Stock actual</span>
              <span className="tabular-nums">
                {formatStock(product.stock)} {product.unit}
              </span>
            </div>
            {preview.status === 'ok' && (
              <div className="flex items-center justify-between font-medium">
                <span>Quedará en</span>
                <span className="tabular-nums">
                  {formatStock(preview.result)} {product.unit}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({preview.delta > 0 ? '+' : ''}
                    {formatStock(preview.delta)})
                  </span>
                </span>
              </div>
            )}
            {preview.status === 'rejected' && (
              <p role="alert" className="text-destructive">
                {preview.error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || preview.status === 'rejected'}>
              {pending && <Spinner />}
              {config.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
