import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPaymentAction,
  issueInvoiceAction,
  searchProductsAction,
  voidInvoiceAction,
  voidPaymentAction,
} from './invoice-action'

const { voidInvoice, issue, searchProducts, addPayment, voidPayment, getAuthUserId, revalidatePath } = vi.hoisted(() => ({
  voidInvoice: vi.fn(),
  addPayment: vi.fn(),
  voidPayment: vi.fn(),
  issue: vi.fn(),
  searchProducts: vi.fn(),
  getAuthUserId: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('../services/InvoiceService', () => ({ invoiceService: { voidInvoice, issue, searchProducts, addPayment, voidPayment } }))
vi.mock('@/lib/supabase/get-user-id', () => ({ getAuthUserId }))
vi.mock('next/cache', () => ({ revalidatePath }))

const ORG = '11111111-1111-4111-8111-111111111111'
const INVOICE = '55555555-5555-4555-8555-555555555555'
const input = (over = {}) => ({ organizationId: ORG, invoiceId: INVOICE, reason: 'Error de digitación', ...over })

beforeEach(() => {
  for (const fn of [voidInvoice, issue, searchProducts, addPayment, voidPayment, revalidatePath]) fn.mockReset()
  getAuthUserId.mockReset().mockResolvedValue('user-1')
})

describe('voidInvoiceAction', () => {
  it('datos inválidos: devuelve el primer mensaje y no toca el servicio', async () => {
    expect(await voidInvoiceAction(input({ reason: ' ' }))).toEqual({ error: 'Indica el motivo de la anulación', success: '' })
    expect(await voidInvoiceAction(input({ organizationId: 'x' }))).toEqual({ error: 'Empresa inválida', success: '' })
    expect(voidInvoice).not.toHaveBeenCalled()
    expect(getAuthUserId).not.toHaveBeenCalled()
  })

  it('sin sesión no anula', async () => {
    getAuthUserId.mockResolvedValue(undefined)
    expect(await voidInvoiceAction(input())).toEqual({ error: 'Sesión no válida', success: '' })
    expect(voidInvoice).not.toHaveBeenCalled()
  })

  it('anula con el usuario de la sesión, separa la empresa del pedido y refresca documentos e inventario', async () => {
    voidInvoice.mockResolvedValue({ error: '', success: 'Documento anulado: F-000012' })
    const result = await voidInvoiceAction(input({ reason: ' Duplicada ' }))

    expect(result).toEqual({ error: '', success: 'Documento anulado: F-000012' })
    expect(voidInvoice).toHaveBeenCalledWith('user-1', ORG, { invoiceId: INVOICE, reason: 'Duplicada' })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/facturacion', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]', 'layout') // la campana de notificaciones
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/facturacion/[id]', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/inventario', 'page') // devuelve stock
  })

  it('si el servicio rechaza, devuelve su error y no refresca nada', async () => {
    voidInvoice.mockResolvedValue({ error: 'El documento ya está anulado', success: '' })
    expect(await voidInvoiceAction(input())).toEqual({ error: 'El documento ya está anulado', success: '' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si el servicio lanza, mensaje genérico sin filtrar detalles', async () => {
    voidInvoice.mockRejectedValue(new Error('connection refused 10.0.0.5'))
    expect(await voidInvoiceAction(input())).toEqual({ error: 'No se pudo anular el documento', success: '' })
  })
})

describe('issueInvoiceAction', () => {
  const PRODUCT = '33333333-3333-4333-8333-333333333333'
  const KEY = '44444444-4444-4444-8444-444444444444'
  const request = (over = {}) => ({
    organizationId: ORG, documentType: 'invoice' as const, customerId: null, dueDate: null, notes: '', paid: false, idempotencyKey: KEY,
    lines: [{ productId: PRODUCT, description: '', unit: '', quantity: 2, unitPrice: 0, discountType: 'percent' as const, discountValue: 0, taxRate: null }],
    ...over,
  })
  const invoice = { id: INVOICE, number: 12, documentType: 'invoice', total: 2380 }

  it('datos inválidos: devuelve el primer mensaje y no toca el servicio', async () => {
    expect(await issueInvoiceAction(request({ lines: [] }))).toEqual({ error: 'Agrega al menos un producto', success: '' })
    expect(await issueInvoiceAction(request({ organizationId: 'x' }))).toEqual({ error: 'Empresa inválida', success: '' })
    expect(issue).not.toHaveBeenCalled()
    expect(getAuthUserId).not.toHaveBeenCalled()
  })

  it('sin sesión no emite', async () => {
    getAuthUserId.mockResolvedValue(undefined)
    expect(await issueInvoiceAction(request())).toEqual({ error: 'Sesión no válida', success: '' })
    expect(issue).not.toHaveBeenCalled()
  })

  it('emite con el usuario de la sesión, separa la empresa del pedido y refresca documentos e inventario', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: F-000012', invoice })
    const result = await issueInvoiceAction(request())

    expect(result).toEqual({ error: '', success: 'Documento emitido: F-000012', invoice })
    const [userId, orgId, sent] = issue.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(orgId).toBe(ORG)
    expect(sent).not.toHaveProperty('organizationId')
    expect(sent).toMatchObject({ idempotencyKey: KEY, documentType: 'invoice' })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/facturacion', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]', 'layout') // la campana de notificaciones
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/inventario', 'page') // descuenta stock
  })

  it('si el servicio rechaza (p. ej. sin stock) devuelve su error y no refresca nada', async () => {
    issue.mockResolvedValue({ error: 'Stock insuficiente: Cola 1L (disponible 1 un, pedido 2 un)', success: '' })
    const result = await issueInvoiceAction(request())
    expect(result).toEqual({ error: 'Stock insuficiente: Cola 1L (disponible 1 un, pedido 2 un)', success: '' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si el servicio lanza, mensaje genérico sin filtrar detalles', async () => {
    issue.mockRejectedValue(new Error('connection refused 10.0.0.5'))
    expect(await issueInvoiceAction(request())).toEqual({ error: 'No se pudo emitir el documento', success: '' })
  })
})

describe('searchProductsAction', () => {
  const option = { id: 'p1', sku: 'COLA', barcode: null, name: 'Cola', unit: 'un', price: 1190, taxRate: null, trackStock: true, stock: 3 }

  it('busca con el usuario de la sesión', async () => {
    searchProducts.mockResolvedValue([option])
    expect(await searchProductsAction({ organizationId: ORG, query: ' cola ' })).toEqual({ error: '', products: [option] })
    expect(searchProducts).toHaveBeenCalledWith('user-1', ORG, 'cola')
  })

  it('datos inválidos, sin sesión o con el servicio caído: lista vacía y un mensaje', async () => {
    expect((await searchProductsAction({ organizationId: 'x', query: 'a' })).products).toEqual([])
    expect((await searchProductsAction({ organizationId: ORG, query: 'a'.repeat(101) })).error).toBe('La búsqueda admite máximo 100 caracteres')

    getAuthUserId.mockResolvedValue(undefined)
    expect(await searchProductsAction({ organizationId: ORG, query: 'a' })).toEqual({ error: 'Sesión no válida', products: [] })

    getAuthUserId.mockResolvedValue('user-1')
    searchProducts.mockRejectedValue(new Error('boom'))
    expect(await searchProductsAction({ organizationId: ORG, query: 'a' })).toEqual({ error: 'No se pudo buscar productos', products: [] })
  })
})

describe('addPaymentAction', () => {
  const payment = (over = {}) => ({ organizationId: ORG, invoiceId: INVOICE, amount: 1000, method: 'cash' as const, reference: '', ...over })

  it('datos inválidos: devuelve el primer mensaje y no toca el servicio', async () => {
    expect(await addPaymentAction(payment({ amount: 0 }))).toEqual({ error: 'El monto debe ser mayor a 0', success: '' })
    expect(await addPaymentAction(payment({ organizationId: 'x' }))).toEqual({ error: 'Empresa inválida', success: '' })
    expect(addPayment).not.toHaveBeenCalled()
    expect(getAuthUserId).not.toHaveBeenCalled()
  })

  it('sin sesión no cobra', async () => {
    getAuthUserId.mockResolvedValue(undefined)
    expect(await addPaymentAction(payment())).toEqual({ error: 'Sesión no válida', success: '' })
    expect(addPayment).not.toHaveBeenCalled()
  })

  it('cobra con el usuario de la sesión y refresca la lista y el detalle', async () => {
    addPayment.mockResolvedValue({ error: '', success: 'Cobro registrado. Saldo pendiente: $1.380' })
    expect(await addPaymentAction(payment({ reference: ' T-1 ' }))).toEqual({ error: '', success: 'Cobro registrado. Saldo pendiente: $1.380' })
    expect(addPayment).toHaveBeenCalledWith('user-1', ORG, { invoiceId: INVOICE, amount: 1000, method: 'cash', reference: 'T-1' })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/facturacion', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]', 'layout') // la campana de notificaciones
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/facturacion/[id]', 'page')
  })

  it('si el servicio rechaza, devuelve su error y no refresca nada', async () => {
    addPayment.mockResolvedValue({ error: 'El documento ya está pagado', success: '' })
    expect(await addPaymentAction(payment())).toEqual({ error: 'El documento ya está pagado', success: '' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si el servicio lanza, mensaje genérico sin filtrar detalles', async () => {
    addPayment.mockRejectedValue(new Error('connection refused 10.0.0.5'))
    expect(await addPaymentAction(payment())).toEqual({ error: 'No se pudo registrar el cobro', success: '' })
  })
})

describe('voidPaymentAction', () => {
  const PAYMENT = '99999999-9999-4999-8999-999999999999'
  const request = (over = {}) => ({ organizationId: ORG, paymentId: PAYMENT, reason: 'Error de monto', ...over })

  it('datos inválidos o sin sesión: no toca el servicio', async () => {
    expect((await voidPaymentAction(request({ reason: ' ' }))).error).toBe('Indica el motivo de la anulación')
    getAuthUserId.mockResolvedValue(undefined)
    expect((await voidPaymentAction(request())).error).toBe('Sesión no válida')
    expect(voidPayment).not.toHaveBeenCalled()
  })

  it('anula con el usuario de la sesión y refresca la lista y el detalle', async () => {
    voidPayment.mockResolvedValue({ error: '', success: 'Cobro anulado' })
    expect(await voidPaymentAction(request())).toEqual({ error: '', success: 'Cobro anulado' })
    expect(voidPayment).toHaveBeenCalledWith('user-1', ORG, { paymentId: PAYMENT, reason: 'Error de monto' })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/pos/facturacion/[id]', 'page')
  })

  it('si el servicio rechaza o lanza, devuelve el error y no refresca', async () => {
    voidPayment.mockResolvedValue({ error: 'El cobro ya está anulado', success: '' })
    expect((await voidPaymentAction(request())).error).toBe('El cobro ya está anulado')
    expect(revalidatePath).not.toHaveBeenCalled()

    voidPayment.mockRejectedValue(new Error('boom'))
    expect(await voidPaymentAction(request())).toEqual({ error: 'No se pudo anular el cobro', success: '' })
  })
})
