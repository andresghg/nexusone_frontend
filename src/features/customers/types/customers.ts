export type CustomerRow = {
  id: string
  name: string
  taxId: string | null // RUT o identificación tributaria, ya normalizada
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  active: boolean
  createdAt: string // ISO
}

// Qué clientes listar: los vigentes, los archivados o todos.
export type CustomerStatus = 'active' | 'archived' | 'all'

// Lo mínimo de un cliente para elegirlo en otro formulario (p. ej. al facturar).
export type CustomerOption = {
  id: string
  name: string
  taxId: string | null
  email: string | null
  address: string | null
}
