import z from 'zod'
import { DISCOUNT_TYPES, DOCUMENT_TYPES, MAX_INVOICE_LINES, PAYMENT_METHODS } from '../types/billing'
import { isValidDate } from '../utils/dates'

// Una línea del documento tal como la envía el navegador. Para productos del catálogo el servidor
// IGNORA nombre, unidad y precio y usa los de la base de datos: lo que llega aquí solo identifica
// el producto, la cantidad, el descuento y el impuesto. Los rangos finos (decimales, máximos) los
// valida calculateInvoice, con el número de línea en el mensaje.
export const InvoiceLineSchema = z
  .object({
    productId: z.uuid({ error: 'Producto inválido' }).nullable(), // null = concepto libre (servicio, flete…)
    description: z.string().trim().max(200, { error: 'La descripción admite máximo 200 caracteres' }),
    unit: z.string().trim().max(20, { error: 'La unidad admite máximo 20 caracteres' }),
    quantity: z.number({ error: 'La cantidad debe ser un número' }),
    unitPrice: z.number({ error: 'El precio debe ser un número' }),
    discountType: z.enum(DISCOUNT_TYPES, { error: 'Tipo de descuento inválido' }),
    discountValue: z.number({ error: 'El descuento debe ser un número' }),
    taxRate: z.number({ error: 'El impuesto debe ser un número' }).nullable(), // null = tasa por defecto de la empresa
  })
  .refine((line) => line.productId !== null || line.description !== '', {
    path: ['description'],
    error: 'Describe el concepto',
  })

export const IssueInvoiceSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES, { error: 'Tipo de documento inválido' }),
  customerId: z.uuid({ error: 'Cliente inválido' }).nullable(), // null = sin cliente (consumidor final)
  dueDate: z
    .string()
    .refine(isValidDate, { error: 'Fecha de vencimiento inválida' })
    .nullable(), // null = el plazo por defecto de la empresa
  notes: z.string().trim().max(500, { error: 'Las notas admiten máximo 500 caracteres' }),
  paid: z.boolean(), // true = se cobra al emitir
  paymentMethod: z.enum(PAYMENT_METHODS, { error: 'Método de pago inválido' }).optional(), // por defecto, efectivo
  // La genera el navegador al abrir el formulario: un doble clic o un reintento no duplican el documento
  idempotencyKey: z.uuid({ error: 'Clave de solicitud inválida' }),
  lines: z
    .array(InvoiceLineSchema)
    .min(1, { error: 'Agrega al menos un producto' })
    .max(MAX_INVOICE_LINES, { error: `Máximo ${MAX_INVOICE_LINES} líneas por documento` }),
})

// La acción del navegador agrega la empresa; el servicio la recibe aparte
export const IssueInvoiceActionSchema = IssueInvoiceSchema.extend({
  organizationId: z.uuid({ error: 'Empresa inválida' }),
})

export const SearchProductsActionSchema = z.object({
  organizationId: z.uuid({ error: 'Empresa inválida' }),
  query: z.string().trim().max(100, { error: 'La búsqueda admite máximo 100 caracteres' }),
})

export const VoidInvoiceSchema = z.object({
  invoiceId: z.uuid({ error: 'Documento inválido' }),
  reason: z
    .string()
    .trim()
    .min(3, { error: 'Indica el motivo de la anulación' })
    .max(200, { error: 'El motivo admite máximo 200 caracteres' }),
})

export const AddPaymentSchema = z.object({
  invoiceId: z.uuid({ error: 'Documento inválido' }),
  amount: z
    .number({ error: 'El monto debe ser un número' })
    .positive({ error: 'El monto debe ser mayor a 0' }),
  method: z.enum(PAYMENT_METHODS, { error: 'Método de pago inválido' }),
  reference: z.string().trim().max(100, { error: 'La referencia admite máximo 100 caracteres' }),
})

export const VoidPaymentSchema = z.object({
  paymentId: z.uuid({ error: 'Pago inválido' }),
  reason: z
    .string()
    .trim()
    .min(3, { error: 'Indica el motivo de la anulación' })
    .max(200, { error: 'El motivo admite máximo 200 caracteres' }),
})

export const AddPaymentActionSchema = AddPaymentSchema.extend({
  organizationId: z.uuid({ error: 'Empresa inválida' }),
})

export const VoidPaymentActionSchema = VoidPaymentSchema.extend({
  organizationId: z.uuid({ error: 'Empresa inválida' }),
})

// El diálogo de anulación solo pide el motivo; el documento y la empresa los pone el sistema
export const VoidReasonSchema = VoidInvoiceSchema.pick({ reason: true })

// La acción del navegador agrega la empresa; el servicio la recibe aparte
export const VoidInvoiceActionSchema = VoidInvoiceSchema.extend({
  organizationId: z.uuid({ error: 'Empresa inválida' }),
})

export type InvoiceLineInput = z.infer<typeof InvoiceLineSchema>
export type IssueInvoiceInput = z.infer<typeof IssueInvoiceSchema>
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceSchema>
export type VoidInvoiceActionInput = z.infer<typeof VoidInvoiceActionSchema>
export type VoidReasonValues = z.infer<typeof VoidReasonSchema>
export type IssueInvoiceActionInput = z.infer<typeof IssueInvoiceActionSchema>
export type SearchProductsActionInput = z.infer<typeof SearchProductsActionSchema>
export type AddPaymentInput = z.infer<typeof AddPaymentSchema>
export type VoidPaymentInput = z.infer<typeof VoidPaymentSchema>
export type AddPaymentActionInput = z.infer<typeof AddPaymentActionSchema>
export type VoidPaymentActionInput = z.infer<typeof VoidPaymentActionSchema>
