import { describe, expect, it } from 'vitest'
import { getStockStatus } from './stockStatus'

const p = (stock: number, minStock: number, trackStock = true) => ({ stock, minStock, trackStock })

describe('getStockStatus', () => {
  it('un producto que no controla stock no tiene estado de stock', () => {
    expect(getStockStatus(p(0, 5, false))).toBe('untracked')
    expect(getStockStatus(p(100, 0, false))).toBe('untracked')
  })

  it('stock cero o negativo es "agotado", aunque no haya mínimo', () => {
    expect(getStockStatus(p(0, 0))).toBe('out')
    expect(getStockStatus(p(0, 5))).toBe('out')
    expect(getStockStatus(p(-1, 5))).toBe('out')
  })

  it('stock bajo: mayor que cero y menor o igual al mínimo', () => {
    expect(getStockStatus(p(3, 5))).toBe('low')
    expect(getStockStatus(p(5, 5))).toBe('low') // el límite cuenta como bajo
    expect(getStockStatus(p(0.5, 1))).toBe('low')
  })

  it('stock normal: sobre el mínimo, o sin mínimo configurado', () => {
    expect(getStockStatus(p(6, 5))).toBe('ok')
    expect(getStockStatus(p(4, 0))).toBe('ok')
  })

  it('coincide con el filtro "stock bajo" del repositorio (controla stock y stock <= mínimo)', () => {
    for (const trackStock of [true, false]) {
      for (const stock of [-1, 0, 0.5, 1, 4, 5, 6, 100]) {
        for (const minStock of [0, 1, 5]) {
          const repoFilter = trackStock && stock <= minStock
          const status = getStockStatus(p(stock, minStock, trackStock))
          expect(status === 'out' || status === 'low').toBe(repoFilter)
        }
      }
    }
  })
})
