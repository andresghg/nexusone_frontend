import z from 'zod'

const organizationId = z.uuid({ error: 'Empresa inválida' })

// Campos del formulario de cliente. Los opcionales llegan como '' y el service los guarda como null.
export const CustomerSchema = z.object({
  name: z.string().trim()
    .min(1, { error: 'El nombre es obligatorio' })
    .max(120, { error: 'Máximo 120 caracteres' }),
  taxId: z.string().trim()
    .max(30, { error: 'Máximo 30 caracteres' })
    .regex(/^[A-Za-z0-9.\- ]*$/, { error: 'Usa solo letras, números, puntos y guiones' }),
  email: z.string().trim()
    .max(120, { error: 'Máximo 120 caracteres' })
    .refine((value) => value === '' || z.email().safeParse(value).success, { error: 'Correo inválido' }),
  phone: z.string().trim().max(30, { error: 'Máximo 30 caracteres' }),
  address: z.string().trim().max(200, { error: 'Máximo 200 caracteres' }),
  notes: z.string().trim().max(500, { error: 'Máximo 500 caracteres' }),
})

export const CreateCustomerSchema = CustomerSchema.extend({ organizationId })
// Formulario del navegador: los mismos campos, sin la empresa (que viene del servidor)
export const CustomerFormSchema = CustomerSchema

export const UpdateCustomerSchema = CustomerSchema.extend({
  organizationId,
  customerId: z.uuid({ error: 'Cliente inválido' }),
})

export const SetCustomerActiveSchema = z.object({
  organizationId,
  customerId: z.uuid({ error: 'Cliente inválido' }),
  active: z.boolean(),
})

export type CustomerInput = z.infer<typeof CustomerSchema>
export type CustomerFormValues = z.infer<typeof CustomerFormSchema>
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>
export type SetCustomerActiveInput = z.infer<typeof SetCustomerActiveSchema>
