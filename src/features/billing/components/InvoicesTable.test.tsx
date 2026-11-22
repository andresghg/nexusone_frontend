// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import type { InvoiceListDisplay, InvoiceListRow } from '../types/invoice'
import type { InvoicesQuery } from '../utils/invoiceParams'
import { InvoicesTable } from './InvoicesTable'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/facturacion',
}))

const noFilters: InvoicesQuery = { q: '', status: 'all', payment: 'all', type: 'all', period: 'all', page: 1 }
const display: InvoiceListDisplay = {
  locale: 'es-CL',
  timezone: 'America/Santiago',
  documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes,
}
const BASE_PATH = '/dashboard/acme/pos/facturacion'

const invoice = (over: Partial<InvoiceListRow> = {}): InvoiceListRow => ({
  id: 'inv-1', documentType: 'invoice', number: 12, status: 'issued', paymentStatus: 'unpaid',
  customerName: 'Ana Pérez', customerTaxId: '12345678-5', total: 2380, paidTotal: 0, creditTotal: 0, currency: 'CLP', currencyDecimals: 0,
  issuedAt: '2026-11-10T15:00:00.000Z', dueDate: '2026-12-10', overdue: false, voidReason: null, ...over,
})

const setup = (
  invoices: InvoiceListRow[],
  o: { canCreate?: boolean; canVoid?: boolean; query?: InvoicesQuery; display?: InvoiceListDisplay } = {},
) => {
  const onVoid = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <InvoicesTable
      invoices={invoices}
      display={o.display ?? display}
      query={o.query ?? noFilters}
      canCreate={o.canCreate ?? true}
      canVoid={o.canVoid ?? true}
      basePath={BASE_PATH}
      onVoid={onVoid}
    />,
  )
  return { user, onVoid }
}

const row = (name: RegExp | string) => screen.getByRole('row', { name })
afterEach(cleanup)

describe('InvoicesTable · contenido', () => {
  it('muestra el número, el tipo, la fecha, el cliente y el total', () => {
    setup([invoice()])
    const r = within(row(/F-000012/))
    expect(r.getByText('F-000012')).toBeTruthy()
    expect(r.getByText(/Factura · 10 nov\.? 2026/)).toBeTruthy()
    expect(r.getAllByText('Ana Pérez').length).toBeGreaterThan(0) // en la columna y en la del móvil
    expect(r.getByText('12345678-5')).toBeTruthy()
    expect(r.getByText('$2.380')).toBeTruthy()
  })

  it('la fecha es la del día en la zona horaria de la empresa', () => {
    // 02:00 UTC del 10 es todavía el 9 en Santiago
    setup([invoice({ issuedAt: '2026-11-10T02:00:00.000Z' })])
    expect(screen.getByText(/Factura · 09 nov\.? 2026/)).toBeTruthy()
  })

  it('un documento sin cliente lo dice', () => {
    setup([invoice({ customerName: null, customerTaxId: null })])
    expect(screen.getAllByText('Sin cliente').length).toBeGreaterThan(0)
  })

  it('usa los prefijos y la moneda con que se emitió el documento', () => {
    const custom: InvoiceListDisplay = {
      ...display, locale: 'en-US', documentPrefixes: { invoice: 'FAC', receipt: 'R', sales_note: 'NV', credit_note: 'NC' },
    }
    setup([invoice({ currency: 'USD', currencyDecimals: 2, total: 2380 })], { display: custom })
    expect(screen.getByText('FAC-000012')).toBeTruthy()
    expect(screen.getByText('$2,380.00')).toBeTruthy()
  })

  it('los tipos de documento se distinguen', () => {
    setup([invoice({ id: 'a', documentType: 'receipt', number: 1 }), invoice({ id: 'b', documentType: 'sales_note', number: 3 })])
    expect(screen.getByText('R-000001')).toBeTruthy()
    expect(screen.getByText(/Recibo · /)).toBeTruthy()
    expect(screen.getByText('NV-000003')).toBeTruthy()
    expect(screen.getByText(/Nota de venta · /)).toBeTruthy()
  })
})

describe('InvoicesTable · estado', () => {
  it('pendiente: insignia y fecha de vencimiento', () => {
    setup([invoice()])
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0)
    for (const due of screen.getAllByText(/Vence 10 dic\.? 2026/)) expect(due.className).not.toContain('destructive')
  })

  it('vencida: se destaca la insignia y la fecha', () => {
    setup([invoice({ overdue: true, dueDate: '2026-11-05' })])
    expect(screen.getAllByText('Vencida').length).toBeGreaterThan(0)
    for (const due of screen.getAllByText(/Vence 05 nov\.? 2026/)) expect(due.className).toContain('destructive')
  })

  it('pagada: sin vencimiento', () => {
    setup([invoice({ paymentStatus: 'paid' })])
    expect(screen.getAllByText('Pagada').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Vence/)).toBeNull()
  })

  it('al contado y pendiente: sin fecha de vencimiento', () => {
    setup([invoice({ dueDate: null })])
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Vence/)).toBeNull()
  })

  it('anulada: insignia, motivo, fila atenuada y total tachado', () => {
    setup([invoice({ status: 'void', voidReason: 'Error de digitación', overdue: false })])
    const r = row(/F-000012/)
    expect(within(r).getAllByText('Anulada').length).toBeGreaterThan(0)
    expect(within(r).getByText('Error de digitación')).toBeTruthy() // el motivo solo está en la columna de escritorio
    expect(r.className).toContain('opacity-60')
    expect(within(r).getByText('$2.380').className).toContain('line-through')
    expect(within(r).queryByText(/Vence/)).toBeNull()
  })
})

describe('InvoicesTable · detalle y cobros parciales', () => {
  it('el número del documento es un enlace a su detalle', () => {
    setup([invoice({ id: 'inv-77' })])
    const link = screen.getByRole('link', { name: 'F-000012' })
    expect(link.getAttribute('href')).toBe(`${BASE_PATH}/inv-77`)
  })

  it('un cobro parcial muestra lo que falta por cobrar', () => {
    setup([invoice({ paymentStatus: 'partial', paidTotal: 1000, total: 2380 })])
    expect(screen.getAllByText('Pago parcial').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Saldo $1.380').length).toBeGreaterThan(0)
  })

  it('sin cobros, pagado o anulado no se muestra saldo', () => {
    for (const over of [{ paymentStatus: 'unpaid' as const }, { paymentStatus: 'paid' as const, paidTotal: 2380 }, { status: 'void' as const, paymentStatus: 'partial' as const, paidTotal: 100 }]) {
      cleanup()
      setup([invoice(over)])
      expect(screen.queryByText(/^Saldo/)).toBeNull()
    }
  })
})

describe('InvoicesTable · móvil', () => {
  it('el estado también aparece bajo el monto, para que se vea sin la columna de estado', () => {
    setup([invoice({ overdue: true, dueDate: '2026-11-05' })])
    const total = screen.getByText('$2.380').parentElement as HTMLElement
    expect(within(total).getByText('Vencida')).toBeTruthy()
    expect(within(total).getByText(/Vence 05 nov\.? 2026/)).toBeTruthy()
  })

  it('el motivo de una anulación (largo) no se repite bajo el monto', () => {
    setup([invoice({ status: 'void', voidReason: 'Error de digitación' })])
    const total = screen.getByText('$2.380').parentElement as HTMLElement
    expect(within(total).getByText('Anulada')).toBeTruthy()
    expect(within(total).queryByText('Error de digitación')).toBeNull()
  })
})

describe('InvoicesTable · acciones según permisos', () => {
  it('sin permiso de anular no hay menú de acciones', () => {
    setup([invoice()], { canVoid: false })
    expect(screen.queryByRole('button', { name: 'Acciones de F-000012' })).toBeNull()
  })

  it('quien puede anular ve la acción en los documentos emitidos', async () => {
    const { user, onVoid } = setup([invoice()])
    await user.click(screen.getByRole('button', { name: 'Acciones de F-000012' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Anular'])

    await user.click(await screen.findByRole('menuitem', { name: 'Anular' }))
    expect(onVoid).toHaveBeenCalledWith(invoice())
  })

  it('un documento ya anulado no se puede anular otra vez', () => {
    setup([invoice({ status: 'void' })])
    expect(screen.queryByRole('button', { name: 'Acciones de F-000012' })).toBeNull()
  })

  it('la acción se ofrece solo en la fila que corresponde', () => {
    setup([invoice({ id: 'a', number: 1 }), invoice({ id: 'b', number: 2, status: 'void' })])
    expect(screen.getByRole('button', { name: 'Acciones de F-000001' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Acciones de F-000002' })).toBeNull()
  })
})

describe('InvoicesTable · estados vacíos', () => {
  it('sin documentos y con permiso invita a emitir el primero, con un enlace', () => {
    setup([])
    expect(screen.getByText('Aún no has emitido documentos')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Nueva factura' }).getAttribute('href')).toBe(`${BASE_PATH}/nueva`)
  })

  it('sin documentos y sin permiso no ofrece emitir', () => {
    setup([], { canCreate: false })
    expect(screen.getByText('Cuando se emitan documentos, aparecerán aquí.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Nueva factura' })).toBeNull()
  })

  it('con filtros activos dice "Sin resultados" y permite limpiar', () => {
    setup([], { query: { ...noFilters, payment: 'overdue' } })
    expect(screen.getByText('Sin resultados')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy()
  })
})

describe('InvoicesTable · notas de crédito', () => {
  const note = (over: Partial<InvoiceListRow> = {}) =>
    invoice({ id: 'note-1', documentType: 'credit_note', number: 1, paymentStatus: 'paid', total: 1190, dueDate: null, ...over })

  it('una nota se ve como nota: número NC, tipo, insignia "Emitida" y monto con signo menos', () => {
    setup([note()])
    const r = within(row(/NC-000001/))
    expect(r.getByText('NC-000001')).toBeTruthy()
    expect(r.getByText(/Nota de crédito · 10 nov\.? 2026/)).toBeTruthy()
    expect(r.getAllByText('Emitida').length).toBeGreaterThan(0)
    expect(r.getByText(/−\$\s?1\.190/)).toBeTruthy()
    expect(r.queryByText(/Vence/)).toBeNull()
    expect(within(row(/NC-000001/)).getByRole('link', { name: 'NC-000001' }).getAttribute('href')).toBe(`${BASE_PATH}/note-1`)
  })

  it('una nota nunca muestra vencimiento, aunque llegara con fecha', () => {
    setup([note({ dueDate: '2026-12-10', paymentStatus: 'unpaid' })])
    expect(within(row(/NC-000001/)).queryByText(/Vence/)).toBeNull()
  })

  it('una nota no ofrece anular, ni un documento que ya tiene notas', () => {
    setup([note(), invoice({ id: 'inv-2', number: 13, creditTotal: 1190 })])
    expect(screen.queryByRole('button', { name: 'Acciones de NC-000001' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acciones de F-000013' })).toBeNull()
  })

  it('un documento con notas muestra cuánto se acreditó y un saldo que ya las descuenta', () => {
    setup([invoice({ paymentStatus: 'partial', paidTotal: 1000, creditTotal: 1190 })])
    const r = within(row(/F-000012/))
    expect(r.getByText(/Acreditado\s+\$\s?1\.190/)).toBeTruthy()
    expect(r.getAllByText(/Saldo\s+\$\s?190/).length).toBeGreaterThan(0) // 2.380 − 1.190 − 1.000
  })

  it('un documento acreditado por completo lo dice', () => {
    setup([invoice({ paymentStatus: 'paid', creditTotal: 2380 })])
    expect(within(row(/F-000012/)).getAllByText('Acreditada').length).toBeGreaterThan(0)
  })
})
