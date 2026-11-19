import { isUniqueViolation } from '@/db/pg-errors'
import {
  accessService,
  type IAccessResolver,
} from '@/features/organization/services/AccessService'
import type { CustomerInput } from '../schemas/customerSchema'
import type { CustomerOption } from '../types/customers'
import { normalizeTaxId } from '../utils/taxId'
import {
  customerRepository,
  type CustomerData,
  type CustomerFilters,
  type ICustomerRepository,
  type Pagination,
} from './CustomerRepository'

const fail = (error: string) => ({ error, success: '' })

export const CUSTOMER_SEARCH_LIMIT = 8

export const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

// La página viene de la URL: se normaliza para que nadie pida 10 millones de filas o la página NaN.
const toInt = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.floor(value as number) : fallback

const NO_WRITE = 'No tienes permisos para modificar clientes'
const NOT_FOUND = 'El cliente no existe'

// Normaliza lo que viene del formulario: RUT sin puntos ni espacios y en mayúsculas,
// correo en minúsculas y vacíos a null.
const toData = (d: CustomerInput): CustomerData => ({
  name: d.name.trim(),
  taxId: normalizeTaxId(d.taxId) || null,
  email: d.email.trim().toLowerCase() || null,
  phone: d.phone.trim() || null,
  address: d.address.trim() || null,
  notes: d.notes.trim() || null,
})

// Errores esperables de la base de datos → mensaje para el usuario. Otros se relanzan.
function friendlyError(error: unknown) {
  if (isUniqueViolation(error, 'tax_id')) return 'Ya existe un cliente con ese RUT o identificación tributaria'
  return null
}

export class CustomerService {
  constructor(
    private customers: ICustomerRepository,
    private access: IAccessResolver,
  ) {}

  async list(
    userId: string,
    organizationId: string,
    filters: CustomerFilters = {},
    pagination: Partial<Pagination> = {},
  ) {
    const access = await this.access.authorize(userId, organizationId, 'pos.clientes.read')
    if (!access) return { rows: [], total: 0 }

    return this.customers.findPage(access.organizationId, filters, {
      page: Math.max(1, toInt(pagination.page, 1)),
      pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(pagination.pageSize, DEFAULT_PAGE_SIZE))),
    })
  }

  /** Clientes vigentes que coinciden con lo escrito, para elegirlos en otro formulario. */
  async search(userId: string, organizationId: string, term: string): Promise<CustomerOption[]> {
    const { rows } = await this.list(
      userId,
      organizationId,
      { search: term.trim().slice(0, 100) || undefined, status: 'active' },
      { page: 1, pageSize: CUSTOMER_SEARCH_LIMIT },
    )
    return rows.map((row) => ({ id: row.id, name: row.name, taxId: row.taxId, email: row.email, address: row.address }))
  }

  async create(
    userId: string,
    organizationId: string,
    input: CustomerInput,
  ): Promise<{ error: string; success: string; customer?: CustomerOption }> {
    const access = await this.access.authorize(userId, organizationId, 'pos.clientes.write')
    if (!access) return fail(NO_WRITE)

    const data = toData(input)
    let created: { id: string }
    try {
      created = await this.customers.create(access.organizationId, data)
    } catch (error) {
      const message = friendlyError(error)
      if (message) return fail(message)
      throw error
    }
    // Se devuelve el cliente creado: así otro formulario puede seleccionarlo de inmediato
    return {
      error: '',
      success: 'Cliente creado',
      customer: { id: created.id, name: data.name, taxId: data.taxId, email: data.email, address: data.address },
    }
  }

  async update(userId: string, organizationId: string, customerId: string, input: CustomerInput) {
    const access = await this.access.authorize(userId, organizationId, 'pos.clientes.write')
    if (!access) return fail(NO_WRITE)

    try {
      const updated = await this.customers.update(access.organizationId, customerId, toData(input))
      if (!updated) return fail(NOT_FOUND)
    } catch (error) {
      const message = friendlyError(error)
      if (message) return fail(message)
      throw error
    }
    return { error: '', success: 'Cliente actualizado' }
  }

  // Los clientes no se borran: se archivan, para conservar sus facturas.
  async setActive(userId: string, organizationId: string, customerId: string, active: boolean) {
    const access = await this.access.authorize(userId, organizationId, 'pos.clientes.write')
    if (!access) return fail(NO_WRITE)

    const updated = await this.customers.setActive(access.organizationId, customerId, active)
    if (!updated) return fail(NOT_FOUND)
    return { error: '', success: active ? 'Cliente restaurado' : 'Cliente archivado' }
  }
}

export const customerService = new CustomerService(customerRepository, accessService)
