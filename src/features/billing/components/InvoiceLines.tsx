'use client'

import type { Dispatch } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
import { formatQuantity, toMilli } from '@/features/inventory/utils/stockMath'
import type { StockShortage } from '../types/invoice'
import type { LineTotals } from '../utils/calculateInvoice'
import { formatMoney, type MoneyFormat } from '../utils/formatMoney'
import { parseDecimal, type DraftAction, type DraftLine } from '../utils/invoiceDraft'

type LinePatch = Extract<DraftAction, { type: 'update' }>['patch']

type Props = {
  lines: DraftLine[]
  lineTotals: LineTotals[] | null // por posición; null si el cálculo aún no es válido
  shortages: Map<string, StockShortage>
  format: MoneyFormat
  taxName: string
  defaultTaxRate: number
  canAdjust: boolean // descuentos e impuesto por línea: solo con permiso
  newKey: () => string
  dispatch: Dispatch<DraftAction>
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor: string
  className: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

export function InvoiceLines({
  lines,
  lineTotals,
  shortages,
  format,
  taxName,
  defaultTaxRate,
  canAdjust,
  newKey,
  dispatch,
}: Props) {
  const update = (key: string, patch: LinePatch) => dispatch({ type: 'update', key, patch })

  return (
    <div className="space-y-3">
      {lines.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aún no hay productos. Búscalos arriba por nombre, SKU o código de barras, o agrega un concepto libre.
        </div>
      ) : (
        <ul aria-label="Líneas del documento" className="space-y-3">
          {lines.map((line, index) => {
            const id = (field: string) => `${line.key}-${field}`
            const name = line.productId ? line.description : line.description.trim() || `concepto ${index + 1}`
            const shortage = line.productId ? shortages.get(line.productId) : undefined
            const total = lineTotals?.[index]?.total

            return (
              <li key={line.key} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    {line.productId ? (
                      <>
                        <p className="truncate font-medium">{line.description}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {line.sku} · {formatMoney(parseDecimal(line.unitPrice), format)} por {line.unit}
                          {line.productTaxRate === 0 && line.taxRate === null && ' · Exento'}
                        </p>
                      </>
                    ) : (
                      <Input
                        aria-label="Descripción del concepto"
                        placeholder="Ej. Flete, instalación, servicio…"
                        value={line.description}
                        maxLength={200}
                        onChange={(event) => update(line.key, { description: event.target.value })}
                      />
                    )}

                    {shortage ? (
                      <p role="alert" className="text-xs text-destructive">
                        Solo hay {formatQuantity(Math.max(0, shortage.available))} {line.unit} disponibles
                        {shortage.requested > 0 && ` y pides ${formatQuantity(shortage.requested)}`}
                      </p>
                    ) : (
                      line.trackStock &&
                      line.stock !== null && (
                        <p className="text-xs text-muted-foreground">
                          Stock: {formatQuantity(toMilli(line.stock))} {line.unit}
                        </p>
                      )
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${name}`}
                    onClick={() => dispatch({ type: 'remove', key: line.key })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <Field label="Cantidad" htmlFor={id('quantity')} className="w-28">
                    <Input
                      id={id('quantity')}
                      inputMode="decimal"
                      autoComplete="off"
                      value={line.quantity}
                      aria-invalid={Number.isFinite(parseDecimal(line.quantity)) ? undefined : true}
                      onChange={(event) => update(line.key, { quantity: event.target.value })}
                    />
                  </Field>

                  {!line.productId && (
                    <Field label="Precio unitario" htmlFor={id('price')} className="w-36">
                      <Input
                        id={id('price')}
                        inputMode="decimal"
                        autoComplete="off"
                        value={line.unitPrice}
                        aria-invalid={Number.isFinite(parseDecimal(line.unitPrice)) ? undefined : true}
                        onChange={(event) => update(line.key, { unitPrice: event.target.value })}
                      />
                    </Field>
                  )}

                  {canAdjust && (
                    <>
                      <Field label="Descuento" htmlFor={id('discount')} className="w-44">
                        <div className="flex gap-1">
                          <Input
                            id={id('discount')}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0"
                            value={line.discountValue}
                            onChange={(event) => update(line.key, { discountValue: event.target.value })}
                          />
                          <Select
                            value={line.discountType}
                            onValueChange={(value) =>
                              update(line.key, { discountType: value as DraftLine['discountType'] })
                            }
                          >
                            <SelectTrigger aria-label="Tipo de descuento" className="w-16 shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percent">%</SelectItem>
                              <SelectItem value="amount">{format.currency}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </Field>

                      <Field label={`${taxName} (%)`} htmlFor={id('tax')} className="w-28">
                        <Input
                          id={id('tax')}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={String(line.productTaxRate ?? defaultTaxRate)}
                          value={line.taxRate ?? ''}
                          onChange={(event) =>
                            update(line.key, { taxRate: event.target.value.trim() === '' ? null : event.target.value })
                          }
                        />
                      </Field>
                    </>
                  )}

                  <div className="ml-auto flex flex-col items-end justify-end">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="font-medium tabular-nums" aria-label={`Total de ${name}`}>
                      {total === undefined ? '—' : formatMoney(total, format)}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: 'add-free', key: newKey() })}>
        <Plus aria-hidden />
        Agregar concepto libre
      </Button>
    </div>
  )
}
