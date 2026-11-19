// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addPaymentAction, voidInvoiceAction, voidPaymentAction } from '../action/invoice-action'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import type { InvoiceDetail, InvoiceListDisplay } from '../types/invoice'
import { InvoiceDetailView } from './InvoiceDetailView'

vi.mock('../action/invoice-action', () => ({
  addPaymentAction: vi.fn(),
  voidPaymentAction: vi.fn(),
  voidInvoiceAction: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const ORG = '11111111-1111-4111-8111-111111111111'
const LIST = '/dashboard/acme/pos/facturacion'
const addPayment = vi.mocked(addPaymentAction)
const voidPayment = vi.mocked(voidPaymentAction)
const voidInvoice = vi.mocked(voidInvoiceAction)

const display: InvoiceListDisplay = { locale: 'es-CL', timezone: 'America/Santiago', documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes }

const detail = (over: Partial<InvoiceDetail> = {}): InvoiceDetail => ({
  id: 'inv-1', documentType: 'invoice', number: 12, status: 'issued', paymentStatus: 'partial', issuedAt: '2026-11-10T15:00:00.000Z',
  dueDate: '2026-12-10', overdue: false, currency: 'CLP', currencyDecimals: 0, taxName: 'IVA', pricesIncludeTax: true,
  customer: { name: 'Ana Pérez', taxId: '12345678-5', email: 'ana@x.cl', address: 'Av. Siempre Viva 742' },
  issuer: { legalName: 'Acme SpA', taxId: '76.000.000-1', address: 'Calle 1' },
  subtotal: 2000, discountTotal: 0, taxTotal: 380, total: 2380, paidTotal: 1000, balance: 1380, notes: null, voidReason: null, voidedAt: null,
  items: [
    { position: 1, productId: 'p1', sku: 'COLA', description: 'Cola 1L', unit: 'un', quantity: 2, unitPrice: 1190, discountType: 'percent', discountValue: 0, taxRate: 19, lineGross: 2380, lineDiscount: 0, lineNet: 2000, lineTax: 380, lineTotal: 2380 },
  ],
  payments: [
    { id: 'pay-1', amount: 1000, method: 'transfer', reference: 'T-77', paidAt: '2026-11-11T15:00:00.000Z', voidedAt: null, voidReason: null },
    { id: 'pay-2', amount: 300, method: 'cash', reference: null, paidAt: '2026-11-11T16:00:00.000Z', voidedAt: '2026-11-12T10:00:00.000Z', voidReason: 'Monto mal digitado' },
  ],
  ...over,
})

type Opts = { detail?: InvoiceDetail; canCollect?: boolean; canVoid?: boolean; display?: InvoiceListDisplay }
const setup = (o: Opts = {}) => {
  const print = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0, delay: null })
  render(
    <InvoiceDetailView
      organizationId={ORG}
      detail={o.detail ?? detail()}
      display={o.display ?? display}
      listHref={LIST}
      canCollect={o.canCollect ?? true}
      canVoid={o.canVoid ?? true}
      print={print}
    />,
  )
  return { user, print }
}

const button = (name: string | RegExp) => screen.queryByRole('button', { name })

beforeEach(() => {
  for (const fn of [addPayment, voidPayment, voidInvoice]) fn.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('InvoiceDetailView · contenido', () => {
  it('encabezado: tipo, número, estado, fecha y enlace de vuelta', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Factura F-000012')
    expect(screen.getAllByText('Pago parcial').length).toBeGreaterThan(0)
    expect(screen.getByText(/Emitida el 10 nov\.? 2026/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Facturación/ }).getAttribute('href')).toBe(LIST)
  })

  it('muestra los datos del emisor y del cliente tal como se emitieron', () => {
    setup()
    expect(screen.getByText('Acme SpA')).toBeTruthy()
    expect(screen.getByText('76.000.000-1')).toBeTruthy()
    expect(screen.getByText('Ana Pérez')).toBeTruthy()
    expect(screen.getByText('12345678-5')).toBeTruthy()
    expect(screen.getByText('Av. Siempre Viva 742')).toBeTruthy()
    expect(screen.getByText('ana@x.cl')).toBeTruthy()
  })

  it('sin cliente lo dice', () => {
    setup({ detail: detail({ customer: null }) })
    expect(screen.getByText('Sin cliente')).toBeTruthy()
  })

  it('las líneas, con cantidad, precio, impuesto y total', () => {
    setup()
    const row = within(screen.getByRole('row', { name: /Cola 1L/ }))
    expect(row.getByText('COLA')).toBeTruthy()
    expect(row.getByText('2 un')).toBeTruthy()
    expect(row.getAllByText('$1.190').length).toBeGreaterThan(0)
    expect(row.getByText('19%')).toBeTruthy()
    expect(row.getByText('$2.380')).toBeTruthy()
  })

  it('un descuento se muestra en su forma; sin descuento, un guion', () => {
    const item = detail().items[0]
    setup({ detail: detail({ discountTotal: 300, items: [{ ...item, discountType: 'percent', discountValue: 10 }, { ...item, position: 2, description: 'Pan', discountType: 'amount', discountValue: 190 }, { ...item, position: 3, description: 'Té' }] }) })
    expect(within(screen.getByRole('row', { name: /Cola 1L/ })).getByText('10%')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /Pan/ })).getAllByText('$190').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('row', { name: /Té/ })).getByText('—')).toBeTruthy()
    expect(screen.getByText('Descuentos').nextElementSibling?.textContent).toBe('-$300')
  })

  it('los totales: neto, impuesto y total', () => {
    setup()
    expect(screen.getAllByText('Neto')[0].nextElementSibling?.textContent).toBe('$2.000')
    expect(screen.getByText('IVA 19%').nextElementSibling?.textContent).toBe('$380')
  })

  it('el cobro: total, cobrado, saldo y vencimiento', () => {
    setup()
    const card = within(screen.getByRole('heading', { name: 'Cobro' }).parentElement as HTMLElement)
    expect(card.getByText('Cobrado').nextElementSibling?.textContent).toBe('$1.000')
    expect(card.getByText('Saldo').nextElementSibling?.textContent).toBe('$1.380')
    expect(card.getByText(/10 dic\.? 2026/)).toBeTruthy()
  })

  it('un documento vencido lo destaca', () => {
    setup({ detail: detail({ overdue: true, dueDate: '2026-11-05' }) })
    const due = screen.getByText(/05 nov\.? 2026 · Vencida/)
    expect(due.className).toContain('destructive')
    expect(screen.getAllByText('Vencida').length).toBeGreaterThan(0)
  })

  it('los cobros: el vigente normal y el anulado tachado con su motivo', () => {
    setup()
    const list = within(screen.getByRole('list', { name: 'Cobros del documento' }))
    expect(list.getByText('Transferencia · T-77').className).not.toContain('line-through')
    expect(list.getByText('Efectivo').className).toContain('line-through')
    expect(list.getByText(/Anulado: Monto mal digitado/)).toBeTruthy()
    expect(list.getByText('$300').className).toContain('line-through')
  })

  it('sin cobros lo dice', () => {
    setup({ detail: detail({ payments: [], paidTotal: 0, balance: 2380, paymentStatus: 'unpaid' }) })
    expect(screen.getByText('Aún no hay cobros registrados.')).toBeTruthy()
  })

  it('las notas, si las hay', () => {
    setup({ detail: detail({ notes: 'Entregar el lunes' }) })
    expect(screen.getByText('Entregar el lunes')).toBeTruthy()
  })
})

describe('InvoiceDetailView · permisos y estado', () => {
  it('con todos los permisos: imprimir, cobrar, anular el documento y anular cada cobro vigente', () => {
    setup()
    expect(button('Imprimir')).toBeTruthy()
    expect(button('Registrar cobro')).toBeTruthy()
    expect(button('Anular documento')).toBeTruthy()
    expect(button('Anular cobro de $1.000')).toBeTruthy()
    expect(button('Anular cobro de $300')).toBeNull() // ese cobro ya está anulado
  })

  it('quien no puede cobrar no ve "Registrar cobro"; quien no puede anular, nada de anular', () => {
    setup({ canCollect: false, canVoid: false })
    expect(button('Imprimir')).toBeTruthy()
    expect(button('Registrar cobro')).toBeNull()
    expect(button('Anular documento')).toBeNull()
    expect(button(/Anular cobro/)).toBeNull()
  })

  it('un documento ya pagado no ofrece cobrar', () => {
    setup({ detail: detail({ paymentStatus: 'paid', paidTotal: 2380, balance: 0 }) })
    expect(button('Registrar cobro')).toBeNull()
    expect(button('Anular documento')).toBeTruthy()
  })

  it('un documento anulado: aviso con el motivo, sin cobro ni saldo y sin acciones salvo imprimir', () => {
    setup({ detail: detail({ status: 'void', voidReason: 'Error de digitación', voidedAt: '2026-11-12T12:00:00.000Z', paymentStatus: 'unpaid', paidTotal: 0, balance: 2380 }) })
    const banner = screen.getByRole('status')
    expect(banner.textContent).toContain('Documento anulado el 12 nov')
    expect(banner.textContent).toContain('Motivo: Error de digitación')
    expect(screen.getAllByText('Anulada').length).toBeGreaterThan(0)
    expect(screen.queryByText('Saldo')).toBeNull()
    expect(button('Imprimir')).toBeTruthy()
    expect(button('Registrar cobro')).toBeNull()
    expect(button('Anular documento')).toBeNull()
    expect(button(/Anular cobro/)).toBeNull()
  })

  it('imprimir entrega el documento completo, sin el menú de la aplicación', async () => {
    const { user, print } = setup()
    await user.click(screen.getByRole('button', { name: 'Imprimir' }))
    expect(print).toHaveBeenCalledTimes(1)
    const html = print.mock.calls[0][0] as string
    expect(html).toContain('<title>Factura F-000012</title>')
    expect(html).toContain('Cola 1L')
    expect(html).toContain('Transferencia · T-77')
  })
})

describe('InvoiceDetailView · registrar cobro', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Registrar cobro' }))
    return screen.findByRole('dialog')
  }
  const amount = () => screen.getByLabelText('Monto') as HTMLInputElement
  const submit = () => screen.getByRole('button', { name: 'Registrar cobro', hidden: false })

  it('se abre con el saldo completo como monto', async () => {
    const { user } = setup()
    const dialog = await open(user)
    expect(within(dialog).getByText('Registrar cobro de F-000012')).toBeTruthy()
    expect(within(dialog).getByText(/Saldo pendiente: \$1\.380/)).toBeTruthy()
    expect(amount().value).toBe('1380')
  })

  it('cobra una parte: envía documento, monto, método y referencia, avisa y cierra', async () => {
    addPayment.mockResolvedValue({ error: '', success: 'Cobro registrado. Saldo pendiente: $880' })
    const { user } = setup()
    await open(user)

    await user.clear(amount())
    await user.type(amount(), '500')
    await user.click(screen.getByRole('combobox', { name: 'Método de pago' }))
    await user.click(await screen.findByRole('option', { name: 'Transferencia' }))
    await user.type(screen.getByLabelText('Referencia (opcional)'), ' T-90 ')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(addPayment).toHaveBeenCalledTimes(1))
    expect(addPayment).toHaveBeenCalledWith({ organizationId: ORG, invoiceId: 'inv-1', amount: 500, method: 'transfer', reference: 'T-90' })
    expect(toast.success).toHaveBeenCalledWith('Cobro registrado. Saldo pendiente: $880')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('por defecto cobra el saldo completo, en efectivo', async () => {
    addPayment.mockResolvedValue({ error: '', success: 'Cobro registrado: el documento quedó pagado' })
    const { user } = setup()
    await open(user)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar cobro' }))
    await waitFor(() => expect(addPayment).toHaveBeenCalledWith({ organizationId: ORG, invoiceId: 'inv-1', amount: 1380, method: 'cash', reference: '' }))
  })

  it('valida el monto antes de enviar: vacío, cero, texto, más que el saldo y decimales en una moneda sin ellos', async () => {
    const { user } = setup()
    await open(user)
    const send = () => user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar cobro' }))

    for (const [typed, message] of [
      ['', 'Indica un monto mayor a 0'],
      ['0', 'Indica un monto mayor a 0'],
      ['abc', 'Indica un monto mayor a 0'],
      ['1381', 'Máximo $1.380 (saldo pendiente)'],
      ['100,5', 'El monto debe ser un número entero'],
    ] as const) {
      await user.clear(amount())
      if (typed) await user.type(amount(), typed)
      await send()
      expect((await screen.findByRole('alert')).textContent, typed).toBe(message)
    }
    expect(addPayment).not.toHaveBeenCalled()
  })

  it('con moneda de 2 decimales acepta coma y rechaza fracciones de centavo', async () => {
    const usd = detail({ currency: 'USD', currencyDecimals: 2, total: 12.5, balance: 12.5, paidTotal: 0, paymentStatus: 'unpaid', payments: [] })
    addPayment.mockResolvedValue({ error: '', success: 'ok' })
    const { user } = setup({ detail: usd, display: { ...display, locale: 'en-US' } })
    await open(user)
    expect(amount().value).toBe('12.5')

    await user.clear(amount())
    await user.type(amount(), '5,255')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar cobro' }))
    expect((await screen.findByRole('alert')).textContent).toBe('El monto admite máximo 2 decimales')

    await user.clear(amount())
    await user.type(amount(), '5,25')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar cobro' }))
    await waitFor(() => expect(addPayment.mock.calls[0][0].amount).toBe(5.25))
  })

  it('si el servidor rechaza avisa y deja el diálogo abierto', async () => {
    addPayment.mockResolvedValue({ error: 'El monto supera el saldo pendiente ($100)', success: '' })
    const { user } = setup()
    await open(user)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El monto supera el saldo pendiente ($100)'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('si la petición falla del todo, mensaje genérico', async () => {
    addPayment.mockRejectedValue(new Error('red caída'))
    const { user } = setup()
    await open(user)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar cobro' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo registrar el cobro'))
  })

  it('cada vez que se abre empieza limpio', async () => {
    const { user } = setup()
    await open(user)
    await user.clear(amount())
    await user.type(amount(), '5')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await open(user)
    expect(amount().value).toBe('1380')
  })
})

describe('InvoiceDetailView · anular un cobro', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Anular cobro de $1.000' }))
    return screen.findByRole('dialog')
  }

  it('explica el efecto y qué cobro se anula', async () => {
    const { user } = setup()
    const dialog = await open(user)
    expect(within(dialog).getByText('Anular cobro', { selector: '[data-slot="dialog-title"]' })).toBeTruthy()
    expect(within(dialog).getByText(/Transferencia · \$1\.000/)).toBeTruthy()
    expect(within(dialog).getByText(/vuelve al saldo pendiente/)).toBeTruthy()
  })

  it('exige un motivo', async () => {
    const { user } = setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Anular cobro', hidden: false }))
    expect((await screen.findByRole('alert')).textContent).toBe('Indica el motivo de la anulación')
    expect(voidPayment).not.toHaveBeenCalled()
  })

  it('anula con el cobro, la empresa y el motivo, avisa y cierra', async () => {
    voidPayment.mockResolvedValue({ error: '', success: 'Cobro anulado' })
    const { user } = setup()
    const dialog = await open(user)

    await user.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Pago devuelto')
    await user.click(within(dialog).getByRole('button', { name: 'Anular cobro' }))

    await waitFor(() => expect(voidPayment).toHaveBeenCalledWith({ organizationId: ORG, paymentId: 'pay-1', reason: 'Pago devuelto' }))
    expect(toast.success).toHaveBeenCalledWith('Cobro anulado')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('si el servidor rechaza avisa y no cierra', async () => {
    voidPayment.mockResolvedValue({ error: 'El cobro ya está anulado', success: '' })
    const { user } = setup()
    const dialog = await open(user)
    await user.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Duplicado')
    await user.click(within(dialog).getByRole('button', { name: 'Anular cobro' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El cobro ya está anulado'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('InvoiceDetailView · anular el documento', () => {
  it('avisa que los cobros quedan anulados y anula con el motivo', async () => {
    voidInvoice.mockResolvedValue({ error: '', success: 'Documento anulado: F-000012' })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Anular documento' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/cobros registrados quedan anulados/)).toBeTruthy()
    await user.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Documento duplicado')
    await user.click(within(dialog).getByRole('button', { name: 'Anular documento' }))

    await waitFor(() => expect(voidInvoice).toHaveBeenCalledWith({ organizationId: ORG, invoiceId: 'inv-1', reason: 'Documento duplicado' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
