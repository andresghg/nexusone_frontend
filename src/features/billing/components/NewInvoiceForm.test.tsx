// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCustomerAction, searchCustomersAction } from '@/features/customers/action/customer-action'
import { issueInvoiceAction, searchProductsAction } from '../action/invoice-action'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import type { ProductOption } from '../types/invoice'
import { NewInvoiceForm } from './NewInvoiceForm'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../action/invoice-action', () => ({ issueInvoiceAction: vi.fn(), searchProductsAction: vi.fn() }))
vi.mock('@/features/customers/action/customer-action', () => ({
  searchCustomersAction: vi.fn(),
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
}))

const ORG = '11111111-1111-4111-8111-111111111111'
const LIST = '/dashboard/acme/pos/facturacion'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const issue = vi.mocked(issueInvoiceAction)
const searchProducts = vi.mocked(searchProductsAction)
const searchCustomers = vi.mocked(searchCustomersAction)
const createCustomer = vi.mocked(createCustomerAction)

const cola: ProductOption = { id: '33333333-3333-4333-8333-333333333333', sku: 'COLA', barcode: null, name: 'Cola 1L', unit: 'un', price: 1190, taxRate: null, trackStock: true, stock: 8 }
const pan: ProductOption = { id: '66666666-6666-4666-8666-666666666666', sku: 'PAN', barcode: null, name: 'Pan de molde', unit: 'kg', price: 2500, taxRate: null, trackStock: false, stock: null }
const ana = { id: '77777777-7777-4777-8777-777777777777', name: 'Ana Pérez', taxId: '12345678-5', email: null, address: null }

type Overrides = { canAdjust?: boolean; canCreateCustomer?: boolean; settings?: Partial<typeof DEFAULT_BILLING_SETTINGS> }

const setup = ({ canAdjust = false, canCreateCustomer = false, settings = {} }: Overrides = {}) => {
  const user = userEvent.setup({ pointerEventsCheck: 0, delay: null })
  render(
    <NewInvoiceForm
      organizationId={ORG}
      settings={{ ...DEFAULT_BILLING_SETTINGS, ...settings }}
      today="2026-11-10"
      listHref={LIST}
      canAdjust={canAdjust}
      canCreateCustomer={canCreateCustomer}
    />,
  )
  return user
}

type User = ReturnType<typeof userEvent.setup>
const addProduct = async (user: User, name: string) => {
  await user.click(screen.getByRole('combobox', { name: 'Buscar producto' }))
  await user.click(await screen.findByRole('option', { name: new RegExp(name) }))
}
const rows = () => within(screen.getByRole('list', { name: 'Líneas del documento' })).getAllByRole('listitem')
const emit = () => screen.getByRole('button', { name: /Emitir/ }) as HTMLButtonElement
const summary = () => within(screen.getByRole('complementary', { name: 'Datos del documento' }))

beforeEach(() => {
  issue.mockReset()
  push.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  searchProducts.mockReset()
  searchProducts.mockResolvedValue({ error: '', products: [cola, pan] })
  searchCustomers.mockReset()
  searchCustomers.mockResolvedValue({ error: '', customers: [ana] })
  createCustomer.mockReset()
})
afterEach(cleanup)

describe('NewInvoiceForm · armar el documento', () => {
  it('parte vacío: invita a buscar productos, total en cero y no se puede emitir', () => {
    setup()
    expect(screen.getByText(/Aún no hay productos/)).toBeTruthy()
    expect(summary().getByText('$0')).toBeTruthy()
    expect(emit().disabled).toBe(true)
    expect(emit().textContent).toBe('Emitir factura')
  })

  it('al elegir un producto aparece su línea con el total y el desglose del impuesto', async () => {
    const user = setup()
    await addProduct(user, 'Cola 1L')

    expect(rows()).toHaveLength(1)
    expect(within(rows()[0]).getByText('Cola 1L')).toBeTruthy()
    expect(within(rows()[0]).getByLabelText('Total de Cola 1L').textContent).toBe('$1.190')
    // $1.190 con impuesto incluido: neto 1.000 + IVA 190
    expect(summary().getByText('Neto').nextElementSibling?.textContent).toBe('$1.000')
    expect(summary().getByText('IVA 19%').nextElementSibling?.textContent).toBe('$190')
    expect(summary().getByText('Total').nextElementSibling?.textContent).toBe('$1.190')
    expect(emit().disabled).toBe(false)
  })

  it('elegir el mismo producto otra vez suma una unidad en la misma línea', async () => {
    const user = setup()
    await addProduct(user, 'Cola 1L')
    await addProduct(user, 'Cola 1L')

    expect(rows()).toHaveLength(1)
    expect((within(rows()[0]).getByLabelText('Cantidad') as HTMLInputElement).value).toBe('2')
    expect(summary().getByText('Total').nextElementSibling?.textContent).toBe('$2.380')
  })

  it('cambiar la cantidad recalcula; acepta coma decimal', async () => {
    const user = setup()
    await addProduct(user, 'Pan de molde')
    const qty = within(rows()[0]).getByLabelText('Cantidad')

    await user.clear(qty)
    await user.type(qty, '1,5')
    expect(summary().getByText('Total').nextElementSibling?.textContent).toBe('$3.750')
  })

  it('una cantidad vacía o inválida muestra el motivo y bloquea la emisión', async () => {
    const user = setup()
    await addProduct(user, 'Cola 1L')
    const qty = within(rows()[0]).getByLabelText('Cantidad')

    await user.clear(qty)
    expect(summary().getByText('Línea 1: la cantidad debe ser mayor a 0')).toBeTruthy()
    expect(qty.getAttribute('aria-invalid')).toBe('true')
    expect(emit().disabled).toBe(true)
    expect(summary().getByText('—')).toBeTruthy()

    await user.type(qty, '2')
    expect(emit().disabled).toBe(false)
  })

  it('quitar una línea la elimina y vuelve al estado vacío', async () => {
    const user = setup()
    await addProduct(user, 'Cola 1L')
    await user.click(screen.getByRole('button', { name: 'Quitar Cola 1L' }))

    expect(screen.queryByRole('list', { name: 'Líneas del documento' })).toBeNull()
    expect(screen.getByText(/Aún no hay productos/)).toBeTruthy()
    expect(emit().disabled).toBe(true)
  })

  it('un concepto libre pide descripción y precio', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Agregar concepto libre' }))

    expect(emit().disabled).toBe(true) // sin precio todavía
    await user.type(screen.getByLabelText('Descripción del concepto'), 'Flete')
    await user.type(screen.getByLabelText('Precio unitario'), '5000')

    expect(summary().getByText('Total').nextElementSibling?.textContent).toBe('$5.000')
    expect(emit().disabled).toBe(false)
  })
})

describe('NewInvoiceForm · permiso de ajuste', () => {
  it('quien solo factura no ve descuento ni impuesto por línea', async () => {
    const user = setup({ canAdjust: false })
    await addProduct(user, 'Cola 1L')
    expect(within(rows()[0]).queryByLabelText('Descuento')).toBeNull()
    expect(within(rows()[0]).queryByLabelText('IVA (%)')).toBeNull()
  })

  it('con permiso de ajuste puede aplicar un descuento y cambiar el impuesto', async () => {
    const user = setup({ canAdjust: true })
    await addProduct(user, 'Cola 1L')
    const row = within(rows()[0])

    await user.type(row.getByLabelText('Descuento'), '10')
    // 1.190 con 10% de descuento = 1.071
    expect(row.getByLabelText('Total de Cola 1L').textContent).toBe('$1.071')
    expect(summary().getByText('Descuentos').nextElementSibling?.textContent).toBe('-$119')

    await user.type(row.getByLabelText('IVA (%)'), '0')
    expect(summary().queryByText(/^IVA/)).toBeNull() // línea exenta: sin renglón de impuesto
  })

  it('el descuento puede ser un monto fijo', async () => {
    const user = setup({ canAdjust: true })
    await addProduct(user, 'Cola 1L')
    const row = within(rows()[0])

    await user.click(row.getByRole('combobox', { name: 'Tipo de descuento' }))
    await user.click(await screen.findByRole('option', { name: 'CLP' }))
    await user.type(row.getByLabelText('Descuento'), '190')
    expect(row.getByLabelText('Total de Cola 1L').textContent).toBe('$1.000')
  })

  it('el descuento se envía solo si hay permiso (con el tipo y el valor)', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: F-000001' })
    const user = setup({ canAdjust: true })
    await addProduct(user, 'Cola 1L')
    await user.type(within(rows()[0]).getByLabelText('Descuento'), '10')
    await user.click(emit())

    await waitFor(() => expect(issue).toHaveBeenCalled())
    expect(issue.mock.calls[0][0].lines[0]).toMatchObject({ discountType: 'percent', discountValue: 10, taxRate: null })
  })
})

describe('NewInvoiceForm · impuesto del producto', () => {
  const libro: ProductOption = { id: '99999999-9999-4999-8999-999999999999', sku: 'LIBRO', barcode: null, name: 'Libro', unit: 'un', price: 5000, taxRate: 0, trackStock: false, stock: null }
  const reducido: ProductOption = { id: '88888888-8888-4888-8888-888888888888', sku: 'PAN10', barcode: null, name: 'Pan integral', unit: 'kg', price: 1100, taxRate: 10, trackStock: false, stock: null }

  it('un producto exento no suma impuesto y se marca en su línea', async () => {
    searchProducts.mockResolvedValue({ error: '', products: [libro, cola] })
    const user = setup()
    await addProduct(user, 'Libro')

    expect(within(rows()[0]).getByText(/Exento/)).toBeTruthy()
    expect(within(rows()[0]).getByLabelText('Total de Libro').textContent).toBe('$5.000')
    expect(summary().getByText('Total').nextElementSibling?.textContent).toBe('$5.000')
    expect(summary().queryByText(/^IVA/)).toBeNull() // sin renglón de impuesto
  })

  it('un producto con tasa propia usa esa tasa en el desglose', async () => {
    searchProducts.mockResolvedValue({ error: '', products: [reducido, cola] })
    const user = setup()
    await addProduct(user, 'Pan integral')
    expect(summary().getByText('IVA 10%').nextElementSibling?.textContent).toBe('$100')
    expect(summary().queryByText('IVA 19%')).toBeNull()
  })

  it('mezclar productos de distinta tasa desglosa cada una', async () => {
    searchProducts.mockResolvedValue({ error: '', products: [libro, reducido, cola] })
    const user = setup()
    await addProduct(user, 'Libro')
    await addProduct(user, 'Pan integral')
    await addProduct(user, 'Cola 1L')

    expect(summary().getByText('IVA 10%').nextElementSibling?.textContent).toBe('$100')
    expect(summary().getByText('IVA 19%').nextElementSibling?.textContent).toBe('$190')
    expect(summary().getByText('Total').nextElementSibling?.textContent).toBe('$7.290')
  })

  it('quien ajusta ve como sugerencia la tasa del producto, y no se envía nada si no la toca', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: F-000001' })
    searchProducts.mockResolvedValue({ error: '', products: [libro] })
    const user = setup({ canAdjust: true })
    await addProduct(user, 'Libro')

    expect((within(rows()[0]).getByLabelText('IVA (%)') as HTMLInputElement).placeholder).toBe('0')
    await user.click(emit())
    await waitFor(() => expect(issue).toHaveBeenCalled())
    expect(issue.mock.calls[0][0].lines[0].taxRate).toBeNull() // el servidor aplica la del producto
  })
})

describe('NewInvoiceForm · stock', () => {
  it('avisa en la línea y en el resumen cuando se pide más de lo disponible, sin impedir emitir', async () => {
    const user = setup()
    await addProduct(user, 'Cola 1L')
    const qty = within(rows()[0]).getByLabelText('Cantidad')
    await user.clear(qty)
    await user.type(qty, '9')

    expect(within(rows()[0]).getByRole('alert').textContent).toBe('Solo hay 8 un disponibles y pides 9')
    expect(screen.getByRole('status').textContent).toContain('más unidades de las disponibles')
    expect(emit().disabled).toBe(false) // el servidor decide con el stock real
  })

  it('con "permitir vender sin stock" no avisa', async () => {
    const user = setup({ settings: { allowNegativeStock: true } })
    await addProduct(user, 'Cola 1L')
    const qty = within(rows()[0]).getByLabelText('Cantidad')
    await user.clear(qty)
    await user.type(qty, '99')
    expect(within(rows()[0]).queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('los productos sin control de stock no avisan nunca', async () => {
    const user = setup()
    await addProduct(user, 'Pan de molde')
    const qty = within(rows()[0]).getByLabelText('Cantidad')
    await user.clear(qty)
    await user.type(qty, '999')
    expect(within(rows()[0]).queryByRole('alert')).toBeNull()
  })
})

describe('NewInvoiceForm · datos del documento', () => {
  it('el tipo de documento cambia el botón y lo que se envía', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: R-000001' })
    const user = setup()
    await addProduct(user, 'Cola 1L')

    await user.click(screen.getByRole('combobox', { name: 'Tipo de documento' }))
    await user.click(await screen.findByRole('option', { name: 'Recibo' }))
    expect(emit().textContent).toBe('Emitir recibo')

    await user.click(emit())
    await waitFor(() => expect(issue).toHaveBeenCalled())
    expect(issue.mock.calls[0][0].documentType).toBe('receipt')
  })

  it('el vencimiento no puede ser anterior a hoy y explica el plazo por defecto', () => {
    setup({ settings: { defaultDueDays: 30 } })
    expect((screen.getByLabelText('Vencimiento') as HTMLInputElement).min).toBe('2026-11-10')
    expect(screen.getByText('Si lo dejas vacío: a 30 días.')).toBeTruthy()
  })

  it('al contado: el plazo por defecto se explica distinto', () => {
    setup({ settings: { defaultDueDays: 0 } })
    expect(screen.getByText('Si lo dejas vacío: al contado.')).toBeTruthy()
  })

  it('se puede elegir un cliente', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: F-000001' })
    const user = setup()
    await addProduct(user, 'Cola 1L')

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.click(await screen.findByText('Ana Pérez'))
    expect(screen.getByRole('combobox', { name: 'Cliente' }).textContent).toContain('Ana Pérez')

    await user.click(emit())
    await waitFor(() => expect(issue).toHaveBeenCalled())
    expect(issue.mock.calls[0][0].customerId).toBe(ana.id)
  })

  it('sin permiso para crear clientes no se ofrece "Nuevo cliente"', async () => {
    const user = setup({ canCreateCustomer: false })
    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await screen.findByText('Ana Pérez')
    expect(screen.queryByText('Nuevo cliente')).toBeNull()
  })

  it('con permiso, crear un cliente desde la factura lo deja elegido', async () => {
    const created = { id: '88888888-8888-4888-8888-888888888888', name: 'Comercial Sur', taxId: null, email: null, address: null }
    createCustomer.mockResolvedValue({ error: '', success: 'Cliente creado', customer: created })
    const user = setup({ canCreateCustomer: true })

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }))
    await user.click(await screen.findByText('Nuevo cliente'))
    await user.type(await screen.findByLabelText('Nombre o razón social'), 'Comercial Sur')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Cliente' }).textContent).toContain('Comercial Sur'))
  })
})

describe('NewInvoiceForm · cobro al emitir', () => {
  it('el método de pago solo se pide si se cobra al emitir', async () => {
    const user = setup()
    expect(screen.queryByRole('combobox', { name: 'Método de pago' })).toBeNull()
    await user.click(screen.getByLabelText('Cobrado al emitir'))
    expect(screen.getByRole('combobox', { name: 'Método de pago' }).textContent).toBe('Efectivo')
  })

  it('el método elegido se envía; si no se cobra, no se envía ninguno', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: F-000001' })
    const user = setup()
    await addProduct(user, 'Cola 1L')
    await user.click(screen.getByLabelText('Cobrado al emitir'))
    await user.click(screen.getByRole('combobox', { name: 'Método de pago' }))
    await user.click(await screen.findByRole('option', { name: 'Transferencia' }))
    await user.click(emit())

    await waitFor(() => expect(issue).toHaveBeenCalled())
    expect(issue.mock.calls[0][0]).toMatchObject({ paid: true, paymentMethod: 'transfer' })

    cleanup()
    issue.mockClear()
    const other = setup()
    await addProduct(other, 'Cola 1L')
    await other.click(emit())
    await waitFor(() => expect(issue).toHaveBeenCalled())
    expect(issue.mock.calls[0][0].paid).toBe(false)
    expect(issue.mock.calls[0][0].paymentMethod).toBeUndefined()
  })
})

describe('NewInvoiceForm · emitir', () => {
  it('envía exactamente lo necesario: solo el producto y la cantidad, sin precio ni nombre', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: F-000001' })
    const user = setup()
    await addProduct(user, 'Cola 1L')
    const qty = within(rows()[0]).getByLabelText('Cantidad')
    await user.clear(qty)
    await user.type(qty, '2')
    await user.type(screen.getByLabelText('Notas'), 'Entregar el lunes')
    await user.click(screen.getByLabelText('Cobrado al emitir'))
    await user.click(emit())

    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1))
    expect(issue).toHaveBeenCalledWith({
      organizationId: ORG,
      documentType: 'invoice',
      customerId: null,
      dueDate: null,
      notes: 'Entregar el lunes',
      paid: true,
      paymentMethod: 'cash',
      idempotencyKey: expect.stringMatching(UUID),
      lines: [
        { productId: cola.id, description: '', unit: '', quantity: 2, unitPrice: 0, discountType: 'percent', discountValue: 0, taxRate: null },
      ],
    })
  })

  it('al emitir avisa, va a la lista y deja el botón bloqueado', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: F-000012' })
    const user = setup()
    await addProduct(user, 'Cola 1L')
    await user.click(emit())

    await waitFor(() => expect(push).toHaveBeenCalledWith(LIST))
    expect(toast.success).toHaveBeenCalledWith('Documento emitido: F-000012')
    expect(emit().disabled).toBe(true)
  })

  it('un doble clic no emite dos veces', async () => {
    let resolve!: (value: { error: string; success: string }) => void
    issue.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = setup()
    await addProduct(user, 'Cola 1L')

    await user.click(emit())
    await user.click(emit())
    expect(issue).toHaveBeenCalledTimes(1)
    resolve({ error: '', success: 'Documento emitido: F-000001' })
    await waitFor(() => expect(push).toHaveBeenCalled())
  })

  it('si el servidor rechaza (sin stock) muestra el motivo, no va a la lista y permite corregir', async () => {
    issue.mockResolvedValue({ error: 'Stock insuficiente: Cola 1L (disponible 1 un, pedido 2 un)', success: '' })
    const user = setup()
    await addProduct(user, 'Cola 1L')
    await user.click(emit())

    const alert = await screen.findByText('Stock insuficiente: Cola 1L (disponible 1 un, pedido 2 un)')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(push).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    await waitFor(() => expect(emit().disabled).toBe(false))
  })

  it('un reintento reutiliza la misma clave: si el primer intento sí se emitió, no se duplica', async () => {
    issue.mockResolvedValueOnce({ error: 'No se pudo emitir el documento', success: '' })
    issue.mockResolvedValueOnce({ error: '', success: 'Documento emitido: F-000001' })
    const user = setup()
    await addProduct(user, 'Cola 1L')

    await user.click(emit())
    await screen.findByText('No se pudo emitir el documento')
    await user.click(emit())
    await waitFor(() => expect(push).toHaveBeenCalled())

    expect(issue.mock.calls[0][0].idempotencyKey).toBe(issue.mock.calls[1][0].idempotencyKey)
  })

  it('si la petición falla del todo, mensaje genérico y se puede reintentar', async () => {
    issue.mockRejectedValue(new Error('red caída'))
    const user = setup()
    await addProduct(user, 'Cola 1L')
    await user.click(emit())

    expect(await screen.findByText(/No se pudo emitir el documento\. Revisa tu conexión/)).toBeTruthy()
    await waitFor(() => expect(emit().disabled).toBe(false))
  })

  it('no emite nada si el borrador no es válido', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Agregar concepto libre' }))
    await user.click(emit())
    expect(issue).not.toHaveBeenCalled()
  })
})

describe('NewInvoiceForm · barra de acción', () => {
  // jsdom no aplica CSS: aquí se prueba la estructura y las clases que producen el comportamiento
  // (pegada abajo en celular, normal desde lg); el aspecto real se revisa en el navegador.
  const bar = () => emit().parentElement!.parentElement as HTMLElement
  const aside = () => screen.getByRole('complementary', { name: 'Datos del documento' })

  it('hay un solo botón de emitir y cuelga directamente del aside, no de la tarjeta de totales', () => {
    setup()
    expect(screen.getAllByRole('button', { name: /Emitir/ })).toHaveLength(1)
    expect(emit().type).toBe('submit')
    expect(bar().parentElement).toBe(aside())
    expect(bar().contains(summary().getByText('$0'))).toBe(false)
  })

  it('en celular el aside no genera caja y la barra se pega abajo; desde lg vuelve a ser la columna de siempre', () => {
    setup()
    expect(aside().classList.contains('contents')).toBe(true)
    expect(aside().classList.contains('lg:sticky')).toBe(true)
    for (const cls of ['sticky', 'bottom-0', 'lg:static', 'bg-background']) {
      expect(bar().classList.contains(cls), cls).toBe(true)
    }
  })

  it('respeta la zona segura inferior de los celulares con barra de gestos', () => {
    setup()
    expect(bar().className).toContain('env(safe-area-inset-bottom)')
  })

  it('con productos repite el total junto al botón, solo para verlo (no se anuncia dos veces)', async () => {
    const user = setup()
    await addProduct(user, 'Cola 1L')
    const total = within(bar()).getByText('Total a emitir').parentElement as HTMLElement
    expect(total.textContent).toBe('Total a emitir$1.190')
    expect(total.getAttribute('aria-hidden')).toBe('true')
    expect(total.classList.contains('lg:hidden')).toBe(true) // en escritorio ya está en el resumen
    // el resumen sigue teniendo un único "Total", que es lo que leen los lectores de pantalla
    expect(summary().getAllByText('Total')).toHaveLength(1)
  })

  it('el total de la barra sigue al documento', async () => {
    const user = setup()
    await addProduct(user, 'Cola 1L')
    const qty = within(rows()[0]).getByLabelText('Cantidad')
    await user.clear(qty)
    await user.type(qty, '2')
    expect(within(bar()).getByText('Total a emitir').parentElement?.textContent).toBe('Total a emitir$2.380')
  })

  it('sin productos, o con el documento inválido, la barra no muestra total y el botón sigue ocupando el ancho', async () => {
    const user = setup()
    expect(within(bar()).queryByText('Total a emitir')).toBeNull()
    await addProduct(user, 'Cola 1L')
    await user.clear(within(rows()[0]).getByLabelText('Cantidad'))
    expect(within(bar()).queryByText('Total a emitir')).toBeNull()
    expect(emit().classList.contains('flex-1')).toBe(true)
  })

  it('el error del servidor aparece dentro de la barra, junto al botón, y se limpia al reintentar', async () => {
    issue.mockResolvedValueOnce({ error: 'Stock insuficiente: Cola 1L (disponible 1 un, pedido 2 un)', success: '' })
    issue.mockResolvedValueOnce({ error: '', success: 'Documento emitido: F-000001' })
    const user = setup()
    await addProduct(user, 'Cola 1L')
    await user.click(emit())

    const alert = await screen.findByRole('alert')
    expect(bar().contains(alert)).toBe(true)
    expect(alert.textContent).toContain('Stock insuficiente')

    await waitFor(() => expect(emit().disabled).toBe(false))
    await user.click(emit())
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect(screen.queryByText(/Stock insuficiente: Cola/)).toBeNull()
  })

  it('el aviso de stock sigue en la tarjeta de totales, no en la barra', async () => {
    const user = setup()
    await addProduct(user, 'Cola 1L')
    const qty = within(rows()[0]).getByLabelText('Cantidad')
    await user.clear(qty)
    await user.type(qty, '9')
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('más unidades de las disponibles')
    expect(bar().contains(status)).toBe(false)
  })

  it('emitir con la barra funciona igual: mismo envío y misma clave', async () => {
    issue.mockResolvedValue({ error: '', success: 'Documento emitido: F-000001' })
    const user = setup()
    await addProduct(user, 'Cola 1L')
    await user.click(emit())
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1))
    expect(issue.mock.calls[0][0]).toMatchObject({ documentType: 'invoice', lines: [expect.objectContaining({ quantity: 1 })] })
    expect(issue.mock.calls[0][0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  })
})
