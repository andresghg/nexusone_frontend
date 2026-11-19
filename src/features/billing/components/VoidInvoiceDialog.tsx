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
import { voidInvoiceAction } from '../action/invoice-action'
import { VoidReasonSchema, type VoidReasonValues } from '../schemas/invoiceSchema'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  invoiceId: string
  documentLabel: string // "F-000012"
}

export function VoidInvoiceDialog({ open, onOpenChange, organizationId, invoiceId, documentLabel }: Props) {
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
      const result = await voidInvoiceAction({ organizationId, invoiceId, reason })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(result.success)
      onOpenChange(false)
    } catch {
      toast.error('No se pudo anular el documento')
    }
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular {documentLabel}</DialogTitle>
          <DialogDescription>
            El stock de los productos de este documento vuelve al inventario y sus cobros registrados quedan
            anulados. El número no se reutiliza y esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Motivo de la anulación</Label>
            <Textarea
              id="void-reason"
              rows={3}
              placeholder="Ej. Error en el monto, documento duplicado…"
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={errors.reason ? 'void-reason-msg' : undefined}
              {...register('reason')}
            />
            {errors.reason && (
              <p id="void-reason-msg" role="alert" className="text-xs text-destructive">
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
              Anular documento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
