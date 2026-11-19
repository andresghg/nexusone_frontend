import { describe, expect, it } from 'vitest'
import { paymentStatusFor } from './paymentStatus'

describe('paymentStatusFor', () => {
  it('sin cobrar, parcial y pagado', () => {
    expect(paymentStatusFor(0, 1190)).toBe('unpaid')
    expect(paymentStatusFor(1, 1190)).toBe('partial')
    expect(paymentStatusFor(1189, 1190)).toBe('partial')
    expect(paymentStatusFor(1190, 1190)).toBe('paid')
  })

  it('un documento de total 0 no tiene nada que cobrar: pagado', () => {
    expect(paymentStatusFor(0, 0)).toBe('paid')
  })

  it('cobrar de más (no debería ocurrir) cuenta como pagado', () => {
    expect(paymentStatusFor(2000, 1190)).toBe('paid')
  })
})
