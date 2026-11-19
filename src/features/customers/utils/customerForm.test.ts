import { describe, expect, it } from 'vitest'
import type { CustomerRow } from '../types/customers'
import { customerToFormValues, emptyCustomerValues } from './customerForm'

const row: CustomerRow = {
  id: 'c-1', name: 'Ana', taxId: null, email: 'ana@x.cl', phone: null, address: null, notes: null,
  active: true, createdAt: '2026-11-01T00:00:00.000Z',
}

describe('customerForm', () => {
  it('un cliente nuevo parte con todo vacío', () => {
    expect(emptyCustomerValues()).toEqual({ name: '', taxId: '', email: '', phone: '', address: '', notes: '' })
  })

  it('los campos null se editan como texto vacío', () => {
    expect(customerToFormValues(row)).toEqual({
      name: 'Ana', taxId: '', email: 'ana@x.cl', phone: '', address: '', notes: '',
    })
  })
})
