import { describe, expect, it } from 'vitest'
import {
  CreateCustomerSchema,
  CustomerFormSchema,
  SetCustomerActiveSchema,
  UpdateCustomerSchema,
} from './customerSchema'

const ORG = '11111111-1111-4111-8111-111111111111'
const CUSTOMER = '22222222-2222-4222-8222-222222222222'

const valid = (over = {}) => ({ name: 'Ana Pérez', taxId: '', email: '', phone: '', address: '', notes: '', ...over })
const firstError = (input: unknown) => {
  const result = CustomerFormSchema.safeParse(input)
  return result.success ? null : result.error.issues[0].message
}

describe('CustomerFormSchema', () => {
  it('solo el nombre es obligatorio', () => {
    expect(CustomerFormSchema.safeParse(valid()).success).toBe(true)
    expect(firstError(valid({ name: '' }))).toBe('El nombre es obligatorio')
    expect(firstError(valid({ name: '   ' }))).toBe('El nombre es obligatorio')
    expect(firstError(valid({ name: 'a'.repeat(121) }))).toBe('Máximo 120 caracteres')
  })

  it('recorta espacios', () => {
    const result = CustomerFormSchema.safeParse(valid({ name: '  Ana  ', email: ' ana@x.cl ', phone: ' 123 ' }))
    expect(result.success && result.data).toMatchObject({ name: 'Ana', email: 'ana@x.cl', phone: '123' })
  })

  it('RUT o ID: letras, números, puntos, guiones y espacios; máximo 30', () => {
    for (const taxId of ['76.123.456-7', '76123456-K', '20-12345678-9', 'B 1234 5678']) {
      expect(CustomerFormSchema.safeParse(valid({ taxId })).success).toBe(true)
    }
    expect(firstError(valid({ taxId: '76/123;456' }))).toBe('Usa solo letras, números, puntos y guiones')
    expect(firstError(valid({ taxId: "1' or 1=1" }))).toBe('Usa solo letras, números, puntos y guiones')
    expect(firstError(valid({ taxId: '1'.repeat(31) }))).toBe('Máximo 30 caracteres')
  })

  it('correo: opcional, pero si se escribe debe ser válido', () => {
    expect(CustomerFormSchema.safeParse(valid({ email: 'ana@empresa.cl' })).success).toBe(true)
    expect(firstError(valid({ email: 'ana@' }))).toBe('Correo inválido')
    expect(firstError(valid({ email: 'sin arroba' }))).toBe('Correo inválido')
    expect(firstError(valid({ email: `${'a'.repeat(120)}@x.cl` }))).toBe('Máximo 120 caracteres')
  })

  it('largos máximos de teléfono, dirección y notas', () => {
    expect(firstError(valid({ phone: '1'.repeat(31) }))).toBe('Máximo 30 caracteres')
    expect(firstError(valid({ address: 'a'.repeat(201) }))).toBe('Máximo 200 caracteres')
    expect(firstError(valid({ notes: 'a'.repeat(501) }))).toBe('Máximo 500 caracteres')
  })
})

describe('schemas con empresa y cliente', () => {
  it('crear exige una empresa válida', () => {
    expect(CreateCustomerSchema.safeParse({ ...valid(), organizationId: ORG }).success).toBe(true)
    expect(CreateCustomerSchema.safeParse({ ...valid(), organizationId: 'x' }).success).toBe(false)
    expect(CreateCustomerSchema.safeParse(valid()).success).toBe(false)
  })

  it('actualizar exige empresa y cliente válidos', () => {
    const base = { ...valid(), organizationId: ORG, customerId: CUSTOMER }
    expect(UpdateCustomerSchema.safeParse(base).success).toBe(true)
    expect(UpdateCustomerSchema.safeParse({ ...base, customerId: 'x' }).success).toBe(false)
  })

  it('archivar exige un booleano', () => {
    expect(SetCustomerActiveSchema.safeParse({ organizationId: ORG, customerId: CUSTOMER, active: false }).success).toBe(true)
    expect(SetCustomerActiveSchema.safeParse({ organizationId: ORG, customerId: CUSTOMER, active: 'no' }).success).toBe(false)
    expect(SetCustomerActiveSchema.safeParse({ organizationId: ORG, customerId: CUSTOMER }).success).toBe(false)
  })
})
