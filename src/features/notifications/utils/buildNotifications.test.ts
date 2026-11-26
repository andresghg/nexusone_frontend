import { describe, expect, it } from 'vitest'
import type { DueSummary } from '../types/notification'
import { buildNotifications, relativeDay } from './buildNotifications'

const BASE = '/dashboard/acme'
const display = { currency: 'CLP', currencyDecimals: 0, locale: 'es-CL', timezone: 'America/Santiago' }
const due = (over: Partial<DueSummary> = {}): DueSummary => ({
  display,
  today: '2026-11-25',
  overdue: { documents: 0, amount: 0 },
  dueSoon: { documents: 0, amount: 0, nextDueDate: null },
  ...over,
})
const build = (over: { lowStockCount?: number; due?: DueSummary | null } = {}) =>
  buildNotifications({ basePath: BASE, lowStockCount: 0, due: due(), ...over })

describe('relativeDay', () => {
  it.each([
    ['2026-11-25', 'hoy'],
    ['2026-11-26', 'mañana'],
    ['2026-11-27', 'en 2 días'],
    ['2026-11-28', 'en 3 días'],
    ['2026-12-02', 'en 7 días'],
  ])('%s → %s', (date, expected) => expect(relativeDay('2026-11-25', date)).toBe(expected))

  it('cruza el fin de mes y de año contando días de calendario', () => {
    expect(relativeDay('2026-12-31', '2027-01-01')).toBe('mañana')
    expect(relativeDay('2026-02-27', '2026-03-01')).toBe('en 2 días') // 2026 no es bisiesto
    expect(relativeDay('2028-02-28', '2028-03-01')).toBe('en 2 días') // 2028 sí
  })

  it('una fecha pasada (no debería llegar aquí) se lee como hoy y no como un número negativo', () => {
    expect(relativeDay('2026-11-25', '2026-11-20')).toBe('hoy')
  })
})

describe('buildNotifications', () => {
  it('sin nada pendiente no hay notificaciones', () => {
    expect(build()).toEqual([])
  })

  it('sin permiso de facturación (due null) y sin stock bajo, tampoco', () => {
    expect(build({ due: null })).toEqual([])
  })

  it('vencidas: crítica, con monto en la moneda de la empresa y enlace al filtro de vencidas', () => {
    const [n] = build({ due: due({ overdue: { documents: 3, amount: 1_250_000 } }) })
    expect(n).toMatchObject({ id: 'overdue', severity: 'critical', title: 'Facturas vencidas', href: `${BASE}/pos/facturacion?payment=overdue` })
    expect(n.description).toBe('3 documentos con saldo vencido por $1.250.000')
  })

  it('usa el singular con un solo documento', () => {
    const [n] = build({ due: due({ overdue: { documents: 1, amount: 5000 } }) })
    expect(n.description).toBe('1 documento con saldo vencido por $5.000')
  })

  it('respeta los decimales y el idioma de la empresa', () => {
    const usd = { currency: 'USD', currencyDecimals: 2, locale: 'en-US', timezone: 'America/New_York' }
    const [n] = build({ due: due({ display: usd, overdue: { documents: 2, amount: 1234.5 } }) })
    expect(n.description).toBe('2 documentos con saldo vencido por $1,234.50')
  })

  it('por vencer, uno solo: dice cuándo vence', () => {
    const today = build({ due: due({ dueSoon: { documents: 1, amount: 10_000, nextDueDate: '2026-11-25' } }) })[0]
    const tomorrow = build({ due: due({ dueSoon: { documents: 1, amount: 10_000, nextDueDate: '2026-11-26' } }) })[0]
    const later = build({ due: due({ dueSoon: { documents: 1, amount: 10_000, nextDueDate: '2026-11-27' } }) })[0]
    expect(today).toMatchObject({ id: 'due_soon', severity: 'warning', title: 'Facturas por vencer', href: `${BASE}/pos/facturacion` })
    expect(today.description).toBe('1 documento vence hoy por $10.000')
    expect(tomorrow.description).toBe('1 documento vence mañana por $10.000')
    expect(later.description).toBe('1 documento vence en 2 días por $10.000')
  })

  it('por vencer, varios: la ventana y cuándo vence el primero', () => {
    const [n] = build({ due: due({ dueSoon: { documents: 4, amount: 80_000, nextDueDate: '2026-11-26' } }) })
    expect(n.description).toBe('4 documentos vencen en los próximos 3 días por $80.000; el primero vence mañana')
  })

  it('por vencer sin fecha conocida no inventa una', () => {
    const [n] = build({ due: due({ dueSoon: { documents: 1, amount: 100, nextDueDate: null } }) })
    expect(n.description).toBe('1 documento vence en los próximos 3 días por $100')
  })

  it('stock bajo: singular, plural y enlace al filtro de stock bajo', () => {
    const one = build({ lowStockCount: 1 })[0]
    const many = build({ lowStockCount: 7 })[0]
    expect(one).toMatchObject({ id: 'low_stock', severity: 'warning', title: 'Stock bajo', href: `${BASE}/pos/inventario?low=1` })
    expect(one.description).toBe('1 producto con stock igual o inferior al mínimo')
    expect(many.description).toBe('7 productos con stock igual o inferior al mínimo')
  })

  it('el stock bajo se avisa aunque el usuario no vea facturación', () => {
    expect(build({ due: null, lowStockCount: 2 }).map((n) => n.id)).toEqual(['low_stock'])
  })

  it('orden de urgencia: vencidas, por vencer, stock bajo', () => {
    const all = build({
      lowStockCount: 2,
      due: due({ overdue: { documents: 1, amount: 1 }, dueSoon: { documents: 1, amount: 1, nextDueDate: '2026-11-25' } }),
    })
    expect(all.map((n) => n.id)).toEqual(['overdue', 'due_soon', 'low_stock'])
  })

  it('el enlace usa la empresa actual', () => {
    const [n] = buildNotifications({ basePath: '/dashboard/otra', lowStockCount: 1, due: null })
    expect(n.href).toBe('/dashboard/otra/pos/inventario?low=1')
  })
})
