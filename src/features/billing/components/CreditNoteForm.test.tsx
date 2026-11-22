// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issueCreditNoteAction } from '../action/invoice-action'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import type { CreditableItem, CreditContext, InvoiceListDisplay } from '../types/invoice'
import { CreditNoteForm } from './CreditNoteForm'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../action/invoice-action', () => ({ issueCreditNoteAction: vi.fn() }))

const ORG = '11111111-1111-4111-8111-111111111111'
const BASE = '/dashboard/acme/pos/facturacion'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const issueNote = vi.mocked(issueCreditNoteAction)

const display: InvoiceListDisplay = { locale: 'es-CL', timezone: 'America/Santiago', documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes }
const none = { quantity: 0, gross: 0, discount: 0, net: 0, tax: 0, total: 0 }
const cola: CreditableItem = {
  itemId: 'item-cola', position: 1, productId: 'p1', sku: 'COLA', description: 'Cola 1L', unit: 'un', taxRate: 19, tracksStock: true,
  quantity: 3, creditedQuantity: 1, remainingQuantity: 2, lineTotal: 3570, creditedTotal: 1190, remainingTotal: 2380,
  source: {
    quantity: 3, taxRate: 19,
    original: { gross: 3570, discount: 0, net: 3000, tax: 570, total: 3570 },
    credited: { quantity: 1, gross: 1190, discount: 0, net: 1000, tax: 190, total: 1190 },
  },
}
const flete: CreditableItem = {
  itemId: 'item-flete', position: 2, productId: null, sku: null, description: 'Flete', unit: 'un', taxRate: 19, tracksStock: false,
  quantity: 1, creditedQuantity: 0, remainingQuantity: 1, lineTotal: 1190, creditedTotal: 0, remainingTotal: 1190,
  source: { quantity: 1, taxRate: 19, original: { gross: 1190, discount: 0, net: 1000, tax: 190, total: 1190 }, credited: none },
}
const bolsa: CreditableItem = {
  itemId: 'item-bolsa', position: 3, productId: 'p3', sku: 'BOL', description: 'Bolsa', unit: 'un', taxRate: 19, tracksStock: true,
  quantity: 1, creditedQuantity: 1, remainingQuantity: 0, lineTotal: 119, creditedTotal: 119, remainingTotal: 0,
  source: {
    quantity: 1, taxRate: 19,
    original: { gross: 119, discount: 0, net: 100, tax: 19, total: 119 },
    credited: { quantity: 1, gross: 119, discount: 0, net: 100, tax: 19, total: 119 },
  },
}
const context = (balance = 3570): CreditContext => ({
  invoice: {
    id: 'inv-1', documentType: 'invoice', number: 12, currency: 'CLP', currencyDecimals: 0, taxName: 'IVA', pricesIncludeTax: true,
    total: 4879, creditTotal: 1309, paidTotal: 4879 - 1309 - balance, balance,
  },
  items: [cola, flete, bolsa],
})

const setup = (ctx = context()) => {
  const user = userEvent.setup({ pointerEventsCheck: 0, delay: null })
  render(<CreditNoteForm organizationId={ORG} context={ctx} display={display} basePath={BASE} />)
  return user
}
type User = ReturnType<typeof userEvent.setup>
const qty = (name: string) => screen.getByRole('textbox', { name: `Cantidad a acreditar de ${name}` }) as HTMLInputElement
const summary = () => within(screen.getByRole('complementary', { name: 'Resumen de la nota de crédito' }))
const reasonBox = () => screen.getByRole('textbox', { name: 'Motivo' }) as HTMLTextAreaElement
const review = () => screen.getByRole('button', { name: 'Revisar y emitir' })
const fill = async (user: User, name: string, value: string) => {
  await user.clear(qty(name))
  await user.type(qty(name), value)
}

beforeEach(() => {
  issueNote.mockReset()
  push.mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('CreditNoteForm · contenido', () => {
  it('muestra cada línea con lo facturado, lo ya acreditado y lo disponible', () => {
    setup()
    const lines = within(screen.getByRole('list', { name: 'Líneas del documento original' })).getAllByRole('listitem')
    expect(lines).toHaveLength(3)
    expect(lines[0].textContent).toContain('Facturado 3 un')
    expect(lines[0].textContent).toContain('Ya acreditado 1 un')
    expect(lines[0].textContent).toContain('Disponible 2 un')
    expect(lines[1].textContent).toContain('Facturado 1 un')
    expect(lines[1].textContent).not.toContain('Ya acreditado')
  })

  it('una línea ya acreditada por completo no tiene campo y lo dice', () => {
    setup()
    expect(screen.getByText('Acreditada por completo')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: /de Bolsa/ })).toBeNull()
  })

  it('"devolver al inventario" solo existe en líneas que controlan stock y viene marcado', () => {
    setup()
    const checks = screen.getAllByRole('checkbox', { name: 'Devolver al inventario' })
    expect(checks).toHaveLength(1) // el flete no controla stock; la bolsa no tiene nada disponible
    expect(checks[0].getAttribute('aria-checked')).toBe('true')
  })

  it('al inicio no hay total y se explica qué hacer', () => {
    setup()
    expect(summary().getByText('Elige cuánto acreditar de cada línea.')).toBeTruthy()
  })
})

describe('CreditNoteForm · total en vivo', () => {
  it('escribir una cantidad muestra lo que acredita la línea y el resumen', async () => {
    const user = setup()
    await fill(user, 'Cola 1L', '1')
    expect(screen.getByLabelText(/Se acreditan/).textContent).toMatch(/−\$\s?1\.190/)
    expect(summary().getByText('Total de la nota').nextSibling?.textContent).toMatch(/\$\s?1\.190/)
    expect(summary().getByText('Neto').nextSibling?.textContent).toMatch(/\$\s?1\.000/)
    expect(summary().getByText('IVA 19%').nextSibling?.textContent).toMatch(/\$\s?190/)
    expect(summary().getByText(/Saldo pendiente del documento: \$\s?2\.380/)).toBeTruthy()
    expect(summary().getByText('1 línea vuelve al inventario.')).toBeTruthy()
  })

  it('"Todo" en una línea llena lo que queda', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Acreditar todo lo disponible de Cola 1L' }))
    expect(qty('Cola 1L').value).toBe('2')
    expect(summary().getByText('Total de la nota').nextSibling?.textContent).toMatch(/\$\s?2\.380/)
  })

  it('"Acreditar todo lo disponible" llena todas las líneas y "Limpiar" las vacía', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Acreditar todo lo disponible' }))
    expect(qty('Cola 1L').value).toBe('2')
    expect(qty('Flete').value).toBe('1')
    expect(summary().getByText('El documento queda sin saldo pendiente')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(qty('Cola 1L').value).toBe('')
    expect(summary().getByText('Elige cuánto acreditar de cada línea.')).toBeTruthy()
  })

  it('acepta coma decimal y calcula proporcional', async () => {
    const user = setup()
    await fill(user, 'Cola 1L', '1,5')
    expect(summary().getByText('Total de la nota').nextSibling?.textContent).toMatch(/\$\s?1\.785/)
  })

  it('si el documento ya estaba cobrado, avisa del saldo a favor del cliente', async () => {
    const user = setup(context(1000)) // queda por cobrar 1.000; la nota es de 1.190
    await fill(user, 'Cola 1L', '1')
    expect(summary().getByText(/Saldo a favor del cliente: \$\s?190/)).toBeTruthy()
    expect(summary().getByText('La devolución del dinero se registra fuera del sistema.')).toBeTruthy()
  })

  it('desmarcar "devolver al inventario" quita el aviso de stock', async () => {
    const user = setup()
    await fill(user, 'Cola 1L', '1')
    await user.click(screen.getByRole('checkbox', { name: 'Devolver al inventario' }))
    expect(summary().queryByText(/vuelve al inventario|vuelven al inventario/)).toBeNull()
  })

  it('una cantidad mayor a la disponible se marca y no se suma', async () => {
    const user = setup()
    await fill(user, 'Cola 1L', '3')
    expect(screen.getByRole('alert').textContent).toBe('Máximo 2 un')
    expect(qty('Cola 1L').getAttribute('aria-invalid')).toBe('true')
    expect(summary().getByText('Elige cuánto acreditar de cada línea.')).toBeTruthy()
  })

  it('texto inválido se marca', async () => {
    const user = setup()
    await fill(user, 'Cola 1L', 'abc')
    expect(screen.getByRole('alert').textContent).toBe('Escribe solo números, con hasta 3 decimales')
  })
})

describe('CreditNoteForm · motivo', () => {
  it('los motivos frecuentes rellenan el campo', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Devolución de productos' }))
    expect(reasonBox().value).toBe('Devolución de productos')
  })
})

describe('CreditNoteForm · emitir', () => {
  it('sin líneas no avanza y lo explica', async () => {
    const user = setup()
    await user.click(review())
    expect(screen.getByText('Elige al menos una línea para acreditar.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sin motivo no avanza y lo explica', async () => {
    const user = setup()
    await fill(user, 'Cola 1L', '1')
    await user.click(review())
    expect(screen.getAllByText('Indica el motivo de la nota de crédito').length).toBeGreaterThan(0)
    expect(reasonBox().getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(issueNote).not.toHaveBeenCalled()
  })

  it('con una línea mal escrita no avanza', async () => {
    const user = setup()
    await fill(user, 'Cola 1L', '9')
    await user.type(reasonBox(), 'Devolución')
    await user.click(review())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Corrige las cantidades marcadas.')).toBeTruthy()
  })

  it('pide confirmar, explica que no se puede anular y permite volver', async () => {
    const user = setup()
    await fill(user, 'Cola 1L', '1')
    await user.type(reasonBox(), 'Devolución de productos')
    await user.click(review())

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/Acreditarás \$\s?1\.190 sobre Factura F-000012/)
    expect(dialog.textContent).toContain('Una nota emitida no se puede anular.')
    await user.click(within(dialog).getByRole('button', { name: 'Volver' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(issueNote).not.toHaveBeenCalled()
  })

  it('emite enviando solo línea, cantidad y stock (nunca montos), con una clave única y va a la nota', async () => {
    issueNote.mockResolvedValue({ error: '', success: 'Nota de crédito emitida: NC-000001.', creditNote: { id: 'note-1' } as never })
    const user = setup()
    await fill(user, 'Cola 1L', '1')
    await fill(user, 'Flete', '1')
    await user.type(reasonBox(), '  Devolución de productos  ')
    await user.click(review())
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Emitir nota de crédito' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith(`${BASE}/note-1`))
    expect(issueNote).toHaveBeenCalledTimes(1)
    const sent = issueNote.mock.calls[0][0]
    expect(sent).toEqual({
      organizationId: ORG,
      invoiceId: 'inv-1',
      reason: 'Devolución de productos',
      idempotencyKey: expect.stringMatching(UUID),
      lines: [
        { itemId: 'item-cola', quantity: 1, restock: true },
        { itemId: 'item-flete', quantity: 1, restock: false },
      ],
    })
    expect(JSON.stringify(sent)).not.toMatch(/total|tax|net|amount/i)
    expect(toast.success).toHaveBeenCalledWith('Nota de crédito emitida: NC-000001.')
  })

  it('respeta "devolver al inventario" desmarcado', async () => {
    issueNote.mockResolvedValue({ error: '', success: 'ok', creditNote: { id: 'n' } as never })
    const user = setup()
    await fill(user, 'Cola 1L', '2')
    await user.click(screen.getByRole('checkbox', { name: 'Devolver al inventario' }))
    await user.type(reasonBox(), 'Producto dañado')
    await user.click(review())
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Emitir nota de crédito' }))
    await waitFor(() => expect(issueNote).toHaveBeenCalled())
    expect(issueNote.mock.calls[0][0].lines).toEqual([{ itemId: 'item-cola', quantity: 2, restock: false }])
  })

  it('si el servidor rechaza, avisa, cierra la confirmación, no navega y el reintento usa la misma clave', async () => {
    issueNote.mockResolvedValueOnce({ error: 'Línea 1: solo quedan 1 por acreditar', success: '' })
    issueNote.mockResolvedValueOnce({ error: '', success: 'ok', creditNote: { id: 'n2' } as never })
    const user = setup()
    await fill(user, 'Cola 1L', '2')
    await user.type(reasonBox(), 'Devolución')
    await user.click(review())
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Emitir nota de crédito' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Línea 1: solo quedan 1 por acreditar'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(push).not.toHaveBeenCalled()

    await user.click(review())
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Emitir nota de crédito' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`${BASE}/n2`))
    expect(issueNote.mock.calls[1][0].idempotencyKey).toBe(issueNote.mock.calls[0][0].idempotencyKey)
  })

  it('si la petición falla del todo, mensaje genérico', async () => {
    issueNote.mockRejectedValue(new Error('network'))
    const user = setup()
    await fill(user, 'Cola 1L', '1')
    await user.type(reasonBox(), 'Devolución')
    await user.click(review())
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Emitir nota de crédito' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo emitir la nota de crédito'))
    expect(push).not.toHaveBeenCalled()
  })
})
