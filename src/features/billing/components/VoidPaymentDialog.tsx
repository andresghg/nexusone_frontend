'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { Label } from '@/shared/components/ui/label'
import { Spinner } from '@/shared/components/ui/spinner'
import { Textarea } from '@/shared/components/ui/textarea'
import { voidPaymentAction } from '../action/invoice-action'
import { VoidReasonSchema, type VoidReasonValues } from '../schemas/invoiceSchema'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  paymentId: string
  summary: string // "Efectivo · $1.000": qué cobro se está anulando
}

export function VoidPaymentDialog({ open, onOpenChange, organizationId, paymentId, summary }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VoidReasonValues>({
    resolver: zodResolver(VoidReasonSchema),
    defaultValues: { reason: '' },
  })

  const onSubmit = handleSubmit(async ({ reason }) => {
    try {
      const result = await voidPaymentAction({ organizationId, paymentId, reason })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.success)
      onOpenChange(false)
    } catch {
      toast.error('No se pudo anular el cobro')
    }
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular cobro</DialogTitle>
          <DialogDescription>
            {summary}. El monto vuelve al saldo pendiente del documento. El cobro queda en el historial como anulado y
            esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="void-payment-reason">Motivo de la anulación</Label>
            <Textarea
              id="void-payment-reason"
              rows={3}
              placeholder="Ej. Monto mal digitado, pago devuelto…"
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={errors.reason ? 'void-payment-reason-msg' : undefined}
              {...register('reason')}
            />
            {errors.reason && (
              <p id="void-payment-reason-msg" role="alert" className="text-xs text-destructive">
                {errors.reason.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              Anular cobro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
