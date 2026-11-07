'use client'

import type { ReactNode } from 'react'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet'
import { Spinner } from '@/shared/components/ui/spinner'
import { Switch } from '@/shared/components/ui/switch'
import { Textarea } from '@/shared/components/ui/textarea'
import { createProductAction, updateProductAction } from '../action/product-action'
import {
  PRODUCT_UNITS,
  ProductFormSchema,
  type ProductFormValues,
} from '../schemas/inventorySchema'
import type { CategoryRow, ProductRow } from '../types/inventory'
import { emptyProductValues, productToFormValues, UNIT_LABEL } from '../utils/productForm'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  categories: CategoryRow[]
  product: ProductRow | null // null = crear
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
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

export function ProductFormSheet({ open, onOpenChange, organizationId, categories, product }: Props) {
  const isEdit = !!product

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: product ? productToFormValues(product) : emptyProductValues(),
  })

  const trackStock = useWatch({ control, name: 'trackStock' })

  const onSubmit = handleSubmit(async (values) => {
    const result = product
      ? await updateProductAction({ ...values, organizationId, productId: product.id })
      : await createProductAction({ ...values, organizationId })

    if (result.error) {
      // Errores de unicidad: se marcan en el campo, no solo en un aviso
      if (result.error.includes('SKU')) setError('sku', { message: result.error })
      else if (result.error.includes('código de barras')) setError('barcode', { message: result.error })
      else toast.error(result.error)
      return
    }

    toast.success(result.success)
    onOpenChange(false)
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar producto' : 'Nuevo producto'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'El stock no se edita aquí: se modifica con movimientos para conservar el historial.'
              : 'Completa los datos del producto. Puedes indicar el stock con el que parte.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col" noValidate>
          <div className="space-y-4 px-4 pb-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU" htmlFor="sku" error={errors.sku?.message}>
                <Input id="sku" autoComplete="off" placeholder="COLA-1L" {...register('sku')} />
              </Field>
              <Field label="Código de barras" htmlFor="barcode" error={errors.barcode?.message}>
                <Input id="barcode" autoComplete="off" inputMode="numeric" {...register('barcode')} />
              </Field>
            </div>

            <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
              <Input id="name" autoComplete="off" placeholder="Bebida cola 1 litro" {...register('name')} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Categoría" htmlFor="categoryId" error={errors.categoryId?.message}>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                    >
                      <SelectTrigger id="categoryId" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin categoría</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field label="Unidad" htmlFor="unit" error={errors.unit?.message}>
                <Controller
                  control={control}
                  name="unit"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="unit" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_UNITS.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {UNIT_LABEL[unit]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Precio de venta" htmlFor="price" error={errors.price?.message}>
                <Input
                  id="price"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  {...register('price', { valueAsNumber: true })}
                />
              </Field>
              <Field label="Costo" htmlFor="cost" error={errors.cost?.message}>
                <Input
                  id="cost"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  {...register('cost', { valueAsNumber: true })}
                />
              </Field>
            </div>

            <Field label="Descripción" htmlFor="description" error={errors.description?.message}>
              <Textarea id="description" rows={3} {...register('description')} />
            </Field>

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="trackStock">Controlar stock</Label>
                <p className="text-xs text-muted-foreground">
                  Desactívalo para servicios o productos sin existencias.
                </p>
              </div>
              <Controller
                control={control}
                name="trackStock"
                render={({ field }) => (
                  <Switch id="trackStock" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>

            {trackStock && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Stock mínimo"
                  htmlFor="minStock"
                  error={errors.minStock?.message}
                  hint="Bajo este nivel se marca como stock bajo."
                >
                  <Input
                    id="minStock"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    {...register('minStock', { valueAsNumber: true })}
                  />
                </Field>

                {!isEdit && (
                  <Field
                    label="Stock inicial"
                    htmlFor="initialStock"
                    error={errors.initialStock?.message}
                    hint="Se registra como una entrada."
                  >
                    <Input
                      id="initialStock"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      {...register('initialStock', { valueAsNumber: true })}
                    />
                  </Field>
                )}
              </div>
            )}
          </div>

          <SheetFooter className="mt-auto flex-row justify-end gap-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {isEdit ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
