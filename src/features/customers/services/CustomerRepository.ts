import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { customers } from '@/db/schema'
import type { CustomerRow, CustomerStatus } from '../types/customers'
import { normalizeTaxId } from '../utils/taxId'

// Los vacíos del formulario se guardan como null.
export type CustomerData = {
  name: string
  taxId: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
}

export type CustomerFilters = {
  search?: string
  status?: CustomerStatus // por defecto 'active'
}

export type Pagination = { page: number; pageSize: number }
export type CustomerPage = { rows: CustomerRow[]; total: number }

// Regla del módulo: `organizationId` es SIEMPRE el primer parámetro y filtra toda consulta.
export interface ICustomerRepository {
  findPage(organizationId: string, filters: CustomerFilters, pagination: Pagination): Promise<CustomerPage>
  findById(organizationId: string, customerId: string): Promise<CustomerRow | undefined>
  create(organizationId: string, data: CustomerData): Promise<{ id: string }>
  update(organizationId: string, customerId: string, data: CustomerData): Promise<boolean>
  setActive(organizationId: string, customerId: string, active: boolean): Promise<boolean>
}

// Escapa los comodines de LIKE para que "50%" busque literalmente "50%".
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

const columns = {
  id: customers.id,
  name: customers.name,
  taxId: customers.taxId,
  email: customers.email,
  phone: customers.phone,
  address: customers.address,
  notes: customers.notes,
  active: customers.active,
  createdAt: customers.createdAt,
}

const toRow = (r: {
  id: string
  name: string
  taxId: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  active: boolean
  createdAt: Date
}): CustomerRow => ({ ...r, createdAt: r.createdAt.toISOString() })

class CustomerRepository implements ICustomerRepository {
  private where(organizationId: string, filters: CustomerFilters) {
    const conditions: SQL[] = [eq(customers.organizationId, organizationId)]

    const status = filters.status ?? 'active'
    if (status === 'active') conditions.push(eq(customers.active, true))
    if (status === 'archived') conditions.push(eq(customers.active, false))

    const search = filters.search?.trim()
    if (search) {
      const term = `%${escapeLike(search)}%`
      const matches = [
        ilike(customers.name, term),
        ilike(customers.email, term),
        ilike(customers.phone, term),
      ]
      // El RUT se guarda sin puntos ni espacios: "76.123" debe encontrar "76123456-7"
      const taxTerm = normalizeTaxId(search)
      if (taxTerm) matches.push(ilike(customers.taxId, `%${escapeLike(taxTerm)}%`))
      conditions.push(or(...matches)!)
    }

    return and(...conditions)
  }

  async findPage(organizationId: string, filters: CustomerFilters, pagination: Pagination) {
    const where = this.where(organizationId, filters)

    const [rows, [{ total }]] = await Promise.all([
      db
        .select(columns)
        .from(customers)
        .where(where)
        .orderBy(asc(customers.name), asc(customers.id)) // el id desempata: la paginación no repite ni salta filas
        .limit(pagination.pageSize)
        .offset((pagination.page - 1) * pagination.pageSize),
      db.select({ total: count() }).from(customers).where(where),
    ])
    return { rows: rows.map(toRow), total }
  }

  async findById(organizationId: string, customerId: string) {
    const [row] = await db
      .select(columns)
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)))
      .limit(1)
    return row ? toRow(row) : undefined
  }

  async create(organizationId: string, data: CustomerData) {
    const [row] = await db
      .insert(customers)
      .values({ organizationId, ...data })
      .returning({ id: customers.id })
    return row
  }

  async update(organizationId: string, customerId: string, data: CustomerData) {
    const rows = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)))
      .returning({ id: customers.id })
    return rows.length > 0
  }

  async setActive(organizationId: string, customerId: string, active: boolean) {
    const rows = await db
      .update(customers)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)))
      .returning({ id: customers.id })
    return rows.length > 0
  }
}

export const customerRepository = new CustomerRepository()
