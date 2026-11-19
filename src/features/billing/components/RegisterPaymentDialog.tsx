'use client'

import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import z from 'zod'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Spinner } from '@/shared/components/ui/spinner'
import { addPaymentAction } from '../action/invoice-action'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '../types/billing'
import { formatMoney, type MoneyFormat } from '../utils/formatMoney'
import { parseDecimal } from '../utils/invoiceDraft'
import { toMinorUnits } from '../utils/minorUnits'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  invoiceId: string
  documentLabel: string // "F-000012"
  balance: number // saldo pendiente: lo máximo que se puede cobrar
  format: MoneyFormat
}

type Values = { amount: string; method: PaymentMethod; reference: string }

/** El formulario valida contra el saldo; el servidor lo vuelve a comprobar al registrar. */
function paymentSchema(balance: number, format: MoneyFormat) {
  return z.object({
    amount: z.string().superRefine((text, ctx) => {
      const amount = parseDecimal(text)
      const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
      if (!Number.isFinite(amount) || amount <= 0) return issue('Indica un monto mayor a 0')
      const minor = toMinorUnits(amount, format.decimals)
      if (minor === null) {
        return issue(format.decimals === 0 ? 'El monto debe ser un número entero' : `El monto admite máximo ${format.decimals} decimales`)
      }
      if (minor > (toMinorUnits(balance, format.decimals) ?? 0)) {
        issue(`Máximo ${formatMoney(balance, format)} (saldo pendiente)`)
      }
    }),
    method: z.enum(PAYMENT_METHODS),
    reference: z.string().trim().max(100, { error: 'La referencia admite máximo 100 caracteres' }),
  })
}

export function RegisterPaymentDialog({ open, onOpenChange, organizationId, invoiceId, documentLabel, balance, format }: Props) {
  const schema = useMemo(() => paymentSchema(balance, format), [balance, format])
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount: String(balance), method: 'cash', reference: '' }, // por defecto, el saldo completo
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await addPaymentAction({
        organizationId,
        invoiceId,
        amount: parseDecimal(values.amount),
        method: values.method,
        reference: values.reference,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.success)
      onOpenChange(false)
    } catch {
      toast.error('No se pudo registrar el cobro')
    }
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar cobro de {documentLabel}</DialogTitle>
          <DialogDescription>
            Saldo pendiente: {formatMoney(balance, format)}. Puedes cobrarlo completo o en partes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Monto</Label>
            <Input
              id="payment-amount"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'payment-amount-msg' : undefined}
              {...register('amount')}
            />
            {errors.amount && (
              <p id="payment-amount-msg" role="alert" className="text-xs text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-method">Método de pago</Label>
            <Controller
              control={control}
              name="method"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
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
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-reference">Referencia (opcional)</Label>
            <Input
              id="payment-reference"
              autoComplete="off"
              placeholder="N.º de transferencia, comprobante…"
              aria-invalid={errors.reference ? true : undefined}
              aria-describedby={errors.reference ? 'payment-reference-msg' : undefined}
              {...register('reference')}
            />
            {errors.reference && (
              <p id="payment-reference-msg" role="alert" className="text-xs text-destructive">
                {errors.reference.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              Registrar cobro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
