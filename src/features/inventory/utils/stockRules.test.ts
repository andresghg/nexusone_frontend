import { describe, expect, it } from 'vitest'
import type { MovementInput, MovementType, StockState } from '../types/inventory'
import { decideMovement, previewMovement } from './stockRules'

const state = (over: Partial<StockState> = {}): StockState => ({
  stock: 10, trackStock: true, active: true, ...over,
})
const move = (type: MovementType, quantity: number, reason = ''): MovementInput => ({
  productId: 'p-1', type, quantity, reason,
})

describe('decideMovement', () => {
  it('entrada: suma la cantidad', () => {
    expect(decideMovement(move('in', 5, ' compra '), state())).toEqual({
      ok: true, type: 'in', delta: '5.000', reason: 'compra',
    })
  })

  it('salida: resta, y puede dejar el stock en cero', () => {
    expect(decideMovement(move('out', 4), state())).toMatchObject({ ok: true, delta: '-4.000' })
    expect(decideMovement(move('out', 10), state())).toMatchObject({ ok: true, delta: '-10.000' })
  })

  it('salida mayor al stock: rechazada, indicando lo disponible', () => {
    expect(decideMovement(move('out', 10.5), state())).toEqual({
      ok: false, error: 'Stock insuficiente (disponible: 10)',
    })
    expect(decideMovement(move('out', 1), state({ stock: 0.5 }))).toEqual({
      ok: false, error: 'Stock insuficiente (disponible: 0.5)',
    })
  })

  it('ajuste: registra la diferencia con el conteo, hacia arriba o hacia abajo', () => {
    expect(decideMovement(move('adjustment', 12, 'Conteo'), state())).toMatchObject({ delta: '2.000' })
    expect(decideMovement(move('adjustment', 7, 'Merma'), state())).toMatchObject({ delta: '-3.000' })
    expect(decideMovement(move('adjustment', 0, 'Sin existencias'), state())).toMatchObject({ delta: '-10.000' })
  })

  it('ajuste igual al stock: nada que ajustar', () => {
    expect(decideMovement(move('adjustment', 10, 'Conteo'), state())).toEqual({
      ok: false, error: 'El stock ya coincide con el conteo',
    })
  })

  it('cantidad cero o negativa en entradas y salidas: rechazada', () => {
    for (const type of ['in', 'out'] as const) {
      expect(decideMovement(move(type, 0), state())).toEqual({ ok: false, error: 'La cantidad debe ser mayor a 0' })
      expect(decideMovement(move(type, -2), state())).toEqual({ ok: false, error: 'La cantidad debe ser mayor a 0' })
    }
  })

  it('producto sin control de stock o archivado: rechazado', () => {
    expect(decideMovement(move('in', 1), state({ trackStock: false }))).toEqual({
      ok: false, error: 'Este producto no controla stock',
    })
    expect(decideMovement(move('in', 1), state({ active: false }))).toEqual({
      ok: false, error: 'El producto está archivado',
    })
  })

  it('con decimales no hay errores de coma flotante', () => {
    expect(decideMovement(move('out', 0.3), state({ stock: 0.1 + 0.2 }))).toMatchObject({ ok: true, delta: '-0.300' })
  })

  it('el motivo vacío se guarda como null', () => {
    expect(decideMovement(move('in', 1, '   '), state())).toMatchObject({ reason: null })
  })
})

describe('previewMovement', () => {
  it('muestra el stock resultante y la diferencia', () => {
    expect(previewMovement({ type: 'in', quantity: 5, reason: '' }, state())).toEqual({ status: 'ok', delta: 5, result: 15 })
    expect(previewMovement({ type: 'out', quantity: 4, reason: '' }, state())).toEqual({ status: 'ok', delta: -4, result: 6 })
    expect(previewMovement({ type: 'adjustment', quantity: 7, reason: 'x' }, state())).toEqual({ status: 'ok', delta: -3, result: 7 })
  })

  it('avisa el rechazo antes de enviar', () => {
    expect(previewMovement({ type: 'out', quantity: 99, reason: '' }, state())).toEqual({
      status: 'rejected', error: 'Stock insuficiente (disponible: 10)',
    })
    expect(previewMovement({ type: 'adjustment', quantity: 10, reason: '' }, state())).toEqual({
      status: 'rejected', error: 'El stock ya coincide con el conteo',
    })
  })

  it('mientras no hay una cantidad válida no muestra nada', () => {
    expect(previewMovement({ type: 'in', quantity: Number.NaN, reason: '' }, state())).toEqual({ status: 'idle' })
    expect(previewMovement({ type: 'in', quantity: 0, reason: '' }, state())).toEqual({ status: 'idle' })
    expect(previewMovement({ type: 'out', quantity: -1, reason: '' }, state())).toEqual({ status: 'idle' })
    expect(previewMovement({ type: 'adjustment', quantity: -1, reason: '' }, state())).toEqual({ status: 'idle' })
  })

  it('un ajuste a cero sí es una cantidad válida', () => {
    expect(previewMovement({ type: 'adjustment', quantity: 0, reason: 'x' }, state())).toEqual({ status: 'ok', delta: -10, result: 0 })
  })

  it('nunca prevé un stock negativo, para ninguna combinación', () => {
    for (const type of ['in', 'out', 'adjustment'] as const) {
      for (const stock of [0, 0.5, 3, 10]) {
        for (const quantity of [0, 0.25, 1, 3, 10, 50]) {
          const preview = previewMovement({ type, quantity, reason: 'x' }, state({ stock }))
          if (preview.status === 'ok') expect(preview.result).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('coincide siempre con la decisión del servidor (misma regla)', () => {
    for (const type of ['in', 'out', 'adjustment'] as const) {
      for (const stock of [0, 2.5, 10]) {
        for (const quantity of [0.5, 1, 2.5, 10, 11]) {
          const input = { productId: 'p', type, quantity, reason: 'x' }
          const plan = decideMovement(input, state({ stock }))
          const preview = previewMovement(input, state({ stock }))
          expect(preview.status === 'ok').toBe(plan.ok)
        }
      }
    }
  })
})
