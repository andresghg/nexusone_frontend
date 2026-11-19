import type { CustomerFormValues } from '../schemas/customerSchema'
import type { CustomerRow } from '../types/customers'

export const emptyCustomerValues = (): CustomerFormValues => ({
  name: '',
  taxId: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
})

// Los campos opcionales vacíos (null) se editan como texto vacío
export const customerToFormValues = (customer: CustomerRow): CustomerFormValues => ({
  name: customer.name,
  taxId: customer.taxId ?? '',
  email: customer.email ?? '',
  phone: customer.phone ?? '',
  address: customer.address ?? '',
  notes: customer.notes ?? '',
})
