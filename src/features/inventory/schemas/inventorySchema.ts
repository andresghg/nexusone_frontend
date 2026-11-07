import z from 'zod'

export const PRODUCT_UNITS = ['un', 'kg', 'g', 'lt', 'ml', 'm', 'caja', 'pack'] as const
export const MOVEMENT_TYPES = ['in', 'out', 'adjustment'] as const

const organizationId = z.uuid({ error: 'Empresa inválida' })

// Dinero: numeric(14,2)
const amount = (label: string) =>
  z
    .number({ error: `${label}: ingresa un número` })
    .min(0, { error: `${label} no puede ser negativo` })
    .max(999_999_999_999, { error: `${label} es demasiado grande` })

// Cantidades: numeric(14,3) → hasta 11 dígitos enteros y 3 decimales
const quantity = (label: string) =>
  z
    .number({ error: `${label}: ingresa un número` })
    .min(0, { error: `${label} no puede ser negativo` })
    .max(99_999_999, { error: `${label} es demasiado grande` })
    .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
      error: `${label}: máximo 3 decimales`,
    })

// Campos del formulario de producto. Los opcionales llegan como '' y el service los guarda como null.
export const ProductSchema = z.object({
  sku: z.string().trim()
    .min(1, { error: 'El SKU es obligatorio' })
    .max(40, { error: 'Máximo 40 caracteres' }),
  barcode: z.string().trim().max(50, { error: 'Máximo 50 caracteres' }),
  name: z.string().trim()
    .min(1, { error: 'El nombre es obligatorio' })
    .max(120, { error: 'Máximo 120 caracteres' }),
  description: z.string().trim().max(500, { error: 'Máximo 500 caracteres' }),
  unit: z.enum(PRODUCT_UNITS, { error: 'Unidad inválida' }),
  categoryId: z.union([z.literal(''), z.uuid({ error: 'Categoría inválida' })]),
  price: amount('El precio'),
  cost: amount('El costo'),
  minStock: quantity('El stock mínimo'),
  trackStock: z.boolean(),
  active: z.boolean(),
})

// Al crear se puede indicar un stock inicial (0 = sin movimiento inicial).
export const CreateProductSchema = ProductSchema.extend({
  organizationId,
  initialStock: quantity('El stock inicial'),
})
// Formulario del navegador: los mismos campos que CreateProductSchema, sin la empresa
// (que viene del servidor). En edición, `initialStock` se ignora.
export const ProductFormSchema = CreateProductSchema.omit({ organizationId: true })

export const UpdateProductSchema = ProductSchema.extend({
  organizationId,
  productId: z.uuid({ error: 'Producto inválido' }),
})
export const SetProductActiveSchema = z.object({
  organizationId,
  productId: z.uuid({ error: 'Producto inválido' }),
  active: z.boolean(),
})

const categoryName = z.string().trim()
  .min(1, { error: 'El nombre es obligatorio' })
  .max(80, { error: 'Máximo 80 caracteres' })

export const CreateCategorySchema = z.object({ organizationId, name: categoryName })
export const RenameCategorySchema = z.object({
  organizationId,
  categoryId: z.uuid({ error: 'Categoría inválida' }),
  name: categoryName,
})
export const DeleteCategorySchema = z.object({
  organizationId,
  categoryId: z.uuid({ error: 'Categoría inválida' }),
})

// Entrada/salida: cantidad > 0. Ajuste: `quantity` es el stock real contado (0 permitido)
// y exige un motivo, para que el historial explique cada corrección.
const movementFields = {
  type: z.enum(MOVEMENT_TYPES, { error: 'Tipo de movimiento inválido' }),
  quantity: quantity('La cantidad'),
  reason: z.string().trim().max(200, { error: 'Máximo 200 caracteres' }),
}
const quantityRule = (d: { type: string; quantity: number }) =>
  d.type === 'adjustment' || d.quantity > 0
const reasonRule = (d: { type: string; reason: string }) =>
  d.type !== 'adjustment' || d.reason.length >= 3

const withMovementRules = <T extends z.ZodType<{ type: string; quantity: number; reason: string }>>(
  schema: T,
) =>
  schema
    .refine(quantityRule, { error: 'La cantidad debe ser mayor a 0', path: ['quantity'] })
    .refine(reasonRule, { error: 'Indica el motivo del ajuste', path: ['reason'] })

export const StockMovementSchema = withMovementRules(
  z.object({
    organizationId,
    productId: z.uuid({ error: 'Producto inválido' }),
    ...movementFields,
  }),
)

// Lo que valida el diálogo del navegador (la empresa y el producto los pone el sistema)
export const MovementFormSchema = withMovementRules(z.object(movementFields))

export const ProductHistorySchema = z.object({
  organizationId,
  productId: z.uuid({ error: 'Producto inválido' }),
})

export type ProductInput = z.infer<typeof ProductSchema>
export type ProductFormValues = z.infer<typeof ProductFormSchema>
export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>
export type SetProductActiveInput = z.infer<typeof SetProductActiveSchema>
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>
export type RenameCategoryInput = z.infer<typeof RenameCategorySchema>
export type DeleteCategoryInput = z.infer<typeof DeleteCategorySchema>
export type StockMovementInput = z.infer<typeof StockMovementSchema>
export type MovementFormValues = z.infer<typeof MovementFormSchema>
export type ProductHistoryInput = z.infer<typeof ProductHistorySchema>
