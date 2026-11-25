import { describe, expect, it } from 'vitest'
import type { SalesBucketRow } from '../types/report'
import { fillBuckets, minor, summarize } from './salesMath'

const row = (over: Partial<SalesBucketRow> = {}): SalesBucketRow => ({
  bucket: '2026-11-01', documents: 0, invoicedTotal: 0, invoicedSubtotal: 0, creditNotes: 0, creditedTotal: 0, creditedSubtotal: 0, ...over,
})

describe('minor', () => {
  it('monto → unidades mínimas, sin ruido de coma flotante', () => {
    expect(minor(1500, 0)).toBe(1500)
    expect(minor(19.99, 2)).toBe(1999)
    expect(minor(0.1 + 0.2, 2)).toBe(30)
  })
  it('lo inválido cuenta como cero en vez de romper un reporte', () => {
    expect(minor(NaN, 0)).toBe(0)
    expect(minor(-5, 0)).toBe(0)
  })
})

describe('fillBuckets', () => {
  it('rellena con cero los períodos sin ventas y respeta el orden pedido', () => {
    const points = fillBuckets([row({ bucket: '2026-11-02', documents: 1, invoicedTotal: 1190, invoicedSubtotal: 1000 })], ['2026-11-01', '2026-11-02', '2026-11-03'], 0)
    expect(points.map((p) => [p.bucket, p.documents, p.netTotal])).toEqual([
      ['2026-11-01', 0, 0],
      ['2026-11-02', 1, 1190],
      ['2026-11-03', 0, 0],
    ])
  })
  it('las ventas netas restan lo acreditado, con y sin impuesto', () => {
    const [point] = fillBuckets([row({ invoicedTotal: 11900, invoicedSubtotal: 10000, creditedTotal: 2380, creditedSubtotal: 2000 })], ['2026-11-01'], 0)
    expect(point.netTotal).toBe(9520)
    expect(point.netSubtotal).toBe(8000)
  })
  it('un día con más notas de crédito que ventas queda en negativo (no se esconde)', () => {
    const [point] = fillBuckets([row({ creditedTotal: 1190, creditedSubtotal: 1000, creditNotes: 1 })], ['2026-11-01'], 0)
    expect(point.netTotal).toBe(-1190)
    expect(point.netSubtotal).toBe(-1000)
  })
  it('ignora filas de la base fuera de la lista pedida', () => {
    expect(fillBuckets([row({ bucket: '2026-10-31', documents: 5 })], ['2026-11-01'], 0)[0].documents).toBe(0)
  })
  it('con decimales no acumula error de coma flotante', () => {
    const [point] = fillBuckets([row({ invoicedTotal: 0.3, invoicedSubtotal: 0.3, creditedTotal: 0.1, creditedSubtotal: 0.1 })], ['2026-11-01'], 2)
    expect(point.netTotal).toBe(0.2)
  })
})

describe('summarize', () => {
  const points = fillBuckets(
    [
      row({ bucket: '2026-11-01', documents: 2, invoicedTotal: 3570, invoicedSubtotal: 3000 }),
      row({ bucket: '2026-11-03', documents: 1, invoicedTotal: 1190, invoicedSubtotal: 1000, creditNotes: 1, creditedTotal: 595, creditedSubtotal: 500 }),
    ],
    ['2026-11-01', '2026-11-02', '2026-11-03'],
    0,
  )

  it('suma todo en unidades mínimas y calcula neto, impuesto neto y cobrado', () => {
    expect(summarize(points, 2000, 0)).toEqual({
      documents: 3,
      creditNotes: 1,
      invoicedTotal: 4760,
      invoicedSubtotal: 4000,
      creditedTotal: 595,
      creditedSubtotal: 500,
      netTotal: 4165,
      netSubtotal: 3500,
      netTax: 665,
      averageTicket: 1587, // 4.760 / 3 = 1.586,67 → se redondea a la moneda
      collected: 2000,
    })
  })

  it('el ticket promedio es lo facturado entre documentos, antes de notas de crédito', () => {
    expect(summarize(points, 0, 0).averageTicket).toBe(Math.round(4760 / 3))
  })

  it('sin documentos todo es cero, también el ticket promedio (sin dividir por cero)', () => {
    const empty = summarize(fillBuckets([], ['2026-11-01', '2026-11-02'], 0), 0, 0)
    expect(empty).toMatchObject({ documents: 0, netTotal: 0, averageTicket: 0 })
    expect(Number.isNaN(empty.averageTicket)).toBe(false)
  })

  it('el ticket promedio respeta los decimales de la moneda', () => {
    const usd = fillBuckets([row({ documents: 3, invoicedTotal: 10, invoicedSubtotal: 10 })], ['2026-11-01'], 2)
    expect(summarize(usd, 0, 2).averageTicket).toBe(3.33)
  })
})
