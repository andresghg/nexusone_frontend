'use client'

import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet'
import { Spinner } from '@/shared/components/ui/spinner'
import { Textarea } from '@/shared/components/ui/textarea'
import { createCustomerAction, updateCustomerAction } from '../action/customer-action'
import { CustomerFormSchema, type CustomerFormValues } from '../schemas/customerSchema'
import type { CustomerOption, CustomerRow } from '../types/customers'
import { customerToFormValues, emptyCustomerValues } from '../utils/customerForm'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  customer: CustomerRow | null // null = crear
  onCreated?: (customer: CustomerOption) => void // para elegir al cliente recién creado desde otro formulario
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-msg`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

const TAX_ID_HINT = 'Los puntos y espacios se ignoran: 76.123.456-7 y 76123456-7 son el mismo.'

export function CustomerFormSheet({ open, onOpenChange, organizationId, customer, onCreated }: Props) {
  const isEdit = !!customer

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(CustomerFormSchema),
    defaultValues: customer ? customerToFormValues(customer) : emptyCustomerValues(),
  })

  const onSubmit = handleSubmit(async (values) => {
    const created = customer ? undefined : await createCustomerAction({ ...values, organizationId })
    const result =
      created ?? (await updateCustomerAction({ ...values, organizationId, customerId: customer!.id }))

    if (result.error) {
      // Error de unicidad: se marca en el campo, no solo en un aviso
      if (result.error.includes('RUT')) setError('taxId', { message: result.error })
      else toast.error(result.error)
      return
    }

    toast.success(result.success)
    if (created?.customer) onCreated?.(created.customer)
    onOpenChange(false)
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Los cambios no alteran las facturas ya emitidas: conservan los datos con que se crearon.'
              : 'Solo el nombre es obligatorio. El resto puedes completarlo cuando lo necesites.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col" noValidate>
          <div className="space-y-4 px-4 pb-4">
            <Field label="Nombre o razón social" htmlFor="name" error={errors.name?.message}>
              <Input
                id="name"
                autoComplete="off"
                placeholder="Comercial Sur Ltda."
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'name-msg' : undefined}
                {...register('name')}
              />
            </Field>

            <Field
              label="RUT o ID tributario"
              htmlFor="taxId"
              error={errors.taxId?.message}
              hint={TAX_ID_HINT}
            >
              <Input
                id="taxId"
                autoComplete="off"
                placeholder="76.123.456-7"
                aria-invalid={errors.taxId ? true : undefined}
                aria-describedby="taxId-msg"
                {...register('taxId')}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correo" htmlFor="email" error={errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  placeholder="contacto@empresa.cl"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'email-msg' : undefined}
                  {...register('email')}
                />
              </Field>
              <Field label="Teléfono" htmlFor="phone" error={errors.phone?.message}>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="off"
                  placeholder="+56 9 1234 5678"
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={errors.phone ? 'phone-msg' : undefined}
                  {...register('phone')}
                />
              </Field>
            </div>

            <Field label="Dirección" htmlFor="address" error={errors.address?.message}>
              <Input
                id="address"
                autoComplete="off"
                aria-invalid={errors.address ? true : undefined}
                aria-describedby={errors.address ? 'address-msg' : undefined}
                {...register('address')}
              />
            </Field>

            <Field label="Notas" htmlFor="notes" error={errors.notes?.message}>
              <Textarea
                id="notes"
                rows={3}
                aria-invalid={errors.notes ? true : undefined}
                aria-describedby={errors.notes ? 'notes-msg' : undefined}
                {...register('notes')}
              />
            </Field>
          </div>

          <SheetFooter className="mt-auto flex-row justify-end gap-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
