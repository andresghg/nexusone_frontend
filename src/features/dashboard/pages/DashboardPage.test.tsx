// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_FORMAT } from '@/features/billing/types/billing'
import type { DashboardSummary } from '@/features/reports/types/report'
import DashboardPage from './DashboardPage'

afterEach(cleanup)
const BASE = '/dashboard/acme'

const summary = (over: Partial<DashboardSummary> = {}): DashboardSummary => ({
  display: DEFAULT_DISPLAY_FORMAT,
  asOf: '2026-11-23',
  today: { netTotal: 1120, documents: 3 },
  yesterday: { netTotal: 1000 },
  week: { documents: 14 },
  month: { netTotal: 18600, documents: 20, averageTicket: 955 },
  receivables: { total: 6140, overdue: 4950 },
  ...over,
})

const setup = (over: { summary?: DashboardSummary; inventory?: { activeProducts: number; lowStock: number } | null; canViewReports?: boolean } = {}) =>
  render(
    <DashboardPage
      summary={over.summary ?? summary()}
      basePath={BASE}
      inventory={over.inventory === undefined ? { activeProducts: 312, lowStock: 3 } : over.inventory}
      canViewReports={over.canViewReports ?? true}
    />,
  )
const card = (label: string) => screen.getByText(label).closest('li')!

describe('DashboardPage · cifras reales', () => {
  it('muestra las cuatro cifras con la moneda de la empresa y su contexto', () => {
    setup()
    expect(card('Ventas de hoy').textContent).toMatch(/\$\s?1\.120/)
    expect(card('Ventas de hoy').textContent).toMatch(/\+12 % vs\. ayer \(\$\s?1\.000\)/)
    expect(card('Documentos emitidos hoy').textContent).toContain('3')
    expect(card('Documentos emitidos hoy').textContent).toContain('14 documentos en los últimos 7 días')
    expect(card('Ticket promedio del mes').textContent).toMatch(/\$\s?955/)
    expect(card('Ticket promedio del mes').textContent).toMatch(/20 documentos · ventas netas \$\s?18\.600/)
    expect(card('Por cobrar').textContent).toMatch(/\$\s?6\.140/)
  })

  it('ya no quedan las cifras ni la fecha de ejemplo del prototipo', () => {
    setup()
    for (const fake of ['1,284,500', '27,300', '+8 esta semana', 'martes 18 de agosto', 'necesitan reposición\n3']) {
      expect(document.body.textContent).not.toContain(fake)
    }
  })

  it('lo vencido llama la atención con texto, no solo con color', () => {
    setup()
    const detail = within(card('Por cobrar')).getByText(/vencido/)
    expect(detail.textContent).toMatch(/\$\s?4\.950 vencido/)
    expect(detail.className).toContain('text-destructive')
  })

  it('sin nada vencido lo dice y no se pinta de alerta', () => {
    setup({ summary: summary({ receivables: { total: 1000, overdue: 0 } }) })
    const detail = within(card('Por cobrar')).getByText('Nada vencido')
    expect(detail.className).not.toContain('text-destructive')
  })

  it('un día sin ventas no inventa comparaciones', () => {
    setup({ summary: summary({ today: { netTotal: 0, documents: 0 }, yesterday: { netTotal: 0 }, week: { documents: 1 } }) })
    expect(card('Ventas de hoy').textContent).toContain('Todavía sin ventas hoy')
    expect(card('Documentos emitidos hoy').textContent).toContain('1 documento en los últimos 7 días')
  })

  it('el encabezado dice el día real de la empresa', () => {
    setup()
    expect(screen.getByText('Resumen de tu operación — Lunes, 23 de noviembre')).toBeTruthy()
  })

  it('usa la moneda y el idioma de la empresa', () => {
    setup({ summary: summary({ display: { currency: 'USD', currencyDecimals: 2, locale: 'en-US', timezone: 'America/New_York' } }) })
    expect(card('Ventas de hoy').textContent).toContain('$1,120.00')
    expect(screen.getByText('Resumen de tu operación — Monday, November 23')).toBeTruthy()
  })
})

describe('DashboardPage · accesos', () => {
  it('los enlaces llevan a rutas reales de la empresa (antes iban a rutas que no existen)', () => {
    setup()
    expect(screen.getByRole('link', { name: /Nueva factura/ }).getAttribute('href')).toBe(`${BASE}/pos/facturacion/nueva`)
    expect(screen.getByRole('link', { name: /Revisar inventario/ }).getAttribute('href')).toBe(`${BASE}/pos/inventario`)
    expect(screen.getByRole('link', { name: /Ver reportes/ }).getAttribute('href')).toBe(`${BASE}/finanzas/reportes`)
  })

  it('el inventario muestra el stock bajo real y los productos activos', () => {
    setup()
    const link = screen.getByRole('link', { name: /Revisar inventario/ })
    expect(link.textContent).toContain('3 productos necesitan reposición')
    expect(link.textContent).toContain('312 productos activos')
  })

  it('singular y sin stock bajo', () => {
    setup({ inventory: { activeProducts: 1, lowStock: 1 } })
    expect(screen.getByRole('link', { name: /Revisar inventario/ }).textContent).toContain('1 producto necesita reposición')
    expect(screen.getByRole('link', { name: /Revisar inventario/ }).textContent).toContain('1 producto activo')
    cleanup()
    setup({ inventory: { activeProducts: 40, lowStock: 0 } })
    const link = screen.getByRole('link', { name: /Revisar inventario/ })
    expect(link.textContent).toContain('Sin productos con stock bajo')
    expect(within(link).getByText(/Sin productos con stock bajo/).className).not.toContain('text-destructive')
  })

  it('sin permiso de inventario no se ofrece ni se inventan cifras', () => {
    setup({ inventory: null })
    expect(screen.queryByRole('link', { name: /Revisar inventario/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Nueva factura/ })).toBeTruthy()
  })

  it('sin permiso de reportes no aparece el enlace', () => {
    setup({ canViewReports: false })
    expect(screen.queryByRole('link', { name: /Ver reportes/ })).toBeNull()
  })
})
