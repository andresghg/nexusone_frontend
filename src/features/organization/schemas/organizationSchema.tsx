import z from 'zod'
import { isValidRut } from '../utils/rut'

const text = (max: number) =>
  z.string().trim().max(max, { error: `Máximo ${max} caracteres` })

export const OrganizationSchema = z.object({
  name: z.string().trim()
    .min(2, { error: 'Mínimo 2 caracteres' })
    .max(60, { error: 'Máximo 60 caracteres' }),
  legalName: text(120),
  taxId: text(15).refine((v) => v === '' || isValidRut(v), { error: 'RUT no válido' }),
  businessActivity: text(120),
  address: text(160),
  commune: text(60),
  region: text(60),
  phone: text(20),
  contactEmail: z.union([z.literal(''), z.email({ error: 'Correo no válido' })]),
})

export type OrganizationInput = z.infer<typeof OrganizationSchema>