import { describe, expect, it } from 'vitest'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import type { InvoiceDetail, InvoiceListDisplay } from '../types/invoice'
import { buildInvoiceHtml, escapeHtml } from './invoiceHtml'

const display: InvoiceListDisplay = { locale: 'es-CL', timezone: 'America/Santiago', documentPrefixes: DEFAULT_BILLING_SETTINGS.documentPrefixes }

const detail = (over: Partial<InvoiceDetail> = {}): InvoiceDetail => ({
  id: 'i1', documentType: 'invoice', number: 12, status: 'issued', paymentStatus: 'partial', issuedAt: '2026-11-10T15:00:00.000Z',
  dueDate: '2026-12-10', overdue: false, currency: 'CLP', currencyDecimals: 0, taxName: 'IVA', pricesIncludeTax: true,
  customer: { name: 'Ana Pérez', taxId: '12345678-5', email: 'ana@x.cl', address: 'Av. Siempre Viva 742' },
  issuer: { legalName: 'Acme SpA', taxId: '76.000.000-1', address: 'Calle 1' },
  subtotal: 2000, discountTotal: 0, taxTotal: 380, total: 2380, paidTotal: 1000, balance: 1380, notes: null, voidReason: null, voidedAt: null,
  items: [
    { position: 1, productId: 'p1', sku: 'COLA', description: 'Cola 1L', unit: 'un', quantity: 2, unitPrice: 1190, discountType: 'percent', discountValue: 0, taxRate: 19, lineGross: 2380, lineDiscount: 0, lineNet: 2000, lineTax: 380, lineTotal: 2380 },
  ],
  payments: [{ id: 'pay1', amount: 1000, method: 'transfer', reference: 'T-77', paidAt: '2026-11-11T15:00:00.000Z', voidedAt: null, voidReason: null }],
  ...over,
})

describe('escapeHtml', () => {
  it('escapa los caracteres que permiten inyectar HTML', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;')
  })

  it('deja el texto normal como está', () => {
    expect(escapeHtml('Cola 1L — Ñandú')).toBe('Cola 1L — Ñandú')
  })
})

describe('buildInvoiceHtml', () => {
  it('es una página completa con el tipo y el número del documento', () => {
    const html = buildInvoiceHtml(detail(), display)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('<title>Factura F-000012</title>')
    expect(html).toContain('<p class="number">F-000012</p>')
  })

  it('usa el prefijo de la empresa y el tipo de documento', () => {
    const html = buildInvoiceHtml(detail({ documentType: 'sales_note', number: 3 }), { ...display, documentPrefixes: { invoice: 'F', receipt: 'R', sales_note: 'NOTA' } })
    expect(html).toContain('<h1>Nota de venta</h1>')
    expect(html).toContain('NOTA-000003')
  })

  it('muestra emisor, cliente, fechas, líneas y totales con el formato de la empresa', () => {
    const html = buildInvoiceHtml(detail(), display)
    expect(html).toContain('<strong>Acme SpA</strong>')
    expect(html).toContain('76.000.000-1')
    expect(html).toContain('<strong>Ana Pérez</strong>')
    expect(html).toContain('Av. Siempre Viva 742')
    expect(html).toMatch(/Emitida el 10 nov\.? 2026/)
    expect(html).toMatch(/Vence el 10 dic\.? 2026/)
    expect(html).toContain('Cola 1L')
    expect(html).toContain('COLA')
    expect(html).toContain('2 un')
    expect(html).toContain('$1.190')
    expect(html).toContain('IVA 19%')
    expect(html).toContain('$380')
    expect(html).toMatch(/<tr class="grand"><td>Total<\/td><td class="num">\$2\.380<\/td><\/tr>/)
  })

  it('sin cliente lo dice', () => {
    expect(buildInvoiceHtml(detail({ customer: null }), display)).toContain('Sin cliente')
  })

  it('un descuento se muestra en su forma: porcentaje o monto; los exentos no llevan renglón de impuesto', () => {
    const item = detail().items[0]
    const html = buildInvoiceHtml(
      detail({
        discountTotal: 300,
        items: [
          { ...item, discountType: 'percent', discountValue: 10, taxRate: 0, lineTax: 0 },
          { ...item, position: 2, discountType: 'amount', discountValue: 190 },
        ],
      }),
      display,
    )
    expect(html).toContain('10%')
    expect(html).toContain('$190')
    expect(html).toContain('Descuentos</td><td class="num">-$300')
    expect(html.match(/IVA 19%/g)).toHaveLength(1) // en los totales; el 0% no tiene renglón
    expect(html).not.toContain('IVA 0%')
  })

  it('con cobros muestra lo pagado, el saldo y cada cobro vigente', () => {
    const html = buildInvoiceHtml(detail(), display)
    expect(html).toContain('Pagado</td><td class="num">$1.000')
    expect(html).toContain('Saldo</td><td class="num">$1.380')
    expect(html).toContain('<h2>Cobros</h2>')
    expect(html).toContain('Transferencia · T-77')
  })

  it('los cobros anulados no se imprimen', () => {
    const html = buildInvoiceHtml(
      detail({ paidTotal: 0, balance: 2380, payments: [{ id: 'x', amount: 1000, method: 'cash', reference: 'Caja 1', paidAt: '2026-11-11T15:00:00.000Z', voidedAt: '2026-11-12T15:00:00.000Z', voidReason: 'Error' }] }),
      display,
    )
    expect(html).not.toContain('Caja 1')
    expect(html).not.toContain('<h2>Cobros</h2>')
    expect(html).not.toContain('Saldo</td>')
  })

  it('un documento anulado lo declara con su motivo y no muestra cobros', () => {
    const html = buildInvoiceHtml(detail({ status: 'void', voidReason: 'Error de digitación' }), display)
    expect(html).toContain('DOCUMENTO ANULADO · Error de digitación')
    expect(html).not.toContain('<h2>Cobros</h2>')
  })

  it('las notas se muestran con sus saltos de línea', () => {
    expect(buildInvoiceHtml(detail({ notes: 'Línea 1\nLínea 2' }), display)).toContain('Línea 1<br>Línea 2')
  })

  it('usa la moneda con que se emitió el documento', () => {
    const html = buildInvoiceHtml(detail({ currency: 'USD', currencyDecimals: 2, total: 2380 }), { ...display, locale: 'en-US' })
    expect(html).toContain('$2,380.00')
  })

  it('NO deja pasar HTML escrito por las personas, en ningún campo', () => {
    const attack = '<img src=x onerror=alert(1)>'
    const item = detail().items[0]
    const html = buildInvoiceHtml(
      detail({
        notes: attack,
        voidReason: attack,
        status: 'void',
        taxName: attack,
        customer: { name: attack, taxId: attack, email: attack, address: attack },
        issuer: { legalName: attack, taxId: attack, address: attack },
        items: [{ ...item, description: attack, sku: attack, unit: attack }],
        payments: [{ id: 'p', amount: 1, method: 'cash', reference: attack, paidAt: '2026-11-11T15:00:00.000Z', voidedAt: null, voidReason: null }],
      }),
      display,
    )
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('no carga nada externo', () => {
    const html = buildInvoiceHtml(detail(), display)
    expect(html).not.toMatch(/<script|<link|<img|src=|http:\/\/|https:\/\//)
  })
})
