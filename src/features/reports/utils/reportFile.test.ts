import { describe, expect, it } from 'vitest'
import { reportFilename } from './reportFile'

describe('reportFilename', () => {
  it('lleva el reporte y el período, solo con caracteres seguros', () => {
    expect(reportFilename('ventas', { from: '2026-11-01', to: '2026-11-23' }, '2026-11-23', 'xlsx')).toBe('reporte-ventas_2026-11-01_2026-11-23.xlsx')
    expect(reportFilename('productos', { from: '2026-10-01', to: '2026-10-31' }, '2026-11-23', 'xlsx')).toBe('reporte-productos_2026-10-01_2026-10-31.xlsx')
  })
  it('un solo día lleva la fecha una vez', () => {
    expect(reportFilename('ventas', { from: '2026-11-23', to: '2026-11-23' }, '2026-11-23', 'xlsx')).toBe('reporte-ventas_2026-11-23.xlsx')
  })
  it('cobros lleva el período, como ventas', () => {
    expect(reportFilename('cobros', { from: '2026-11-01', to: '2026-11-23' }, '2026-11-24', 'xlsx')).toBe('reporte-cobros_2026-11-01_2026-11-23.xlsx')
    expect(reportFilename('cobros', { from: '2026-11-23', to: '2026-11-23' }, '2026-11-24', 'pdf')).toBe('reporte-cobros_2026-11-23.pdf')
  })
  it('por cobrar lleva la fecha de corte, no un período', () => {
    expect(reportFilename('cobrar', { from: '2026-01-01', to: '2026-11-23' }, '2026-11-24', 'xlsx')).toBe('reporte-por-cobrar_2026-11-24.xlsx')
    expect(reportFilename('cobrar', null, '2026-11-24', 'xlsx')).toBe('reporte-por-cobrar_2026-11-24.xlsx')
  })
  it('nunca incluye espacios ni caracteres que un sistema de archivos rechace', () => {
    for (const tab of ['ventas', 'productos', 'cobros', 'cobrar'] as const) {
      expect(reportFilename(tab, { from: '2026-11-01', to: '2026-11-23' }, '2026-11-23', 'xlsx')).toMatch(/^[a-z0-9_.-]+$/)
    }
  })
})
