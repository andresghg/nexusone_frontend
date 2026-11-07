// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { HistoryResult, MovementRow, ProductRow } from '../types/inventory'
import { HistorySheet } from './HistorySheet'

const product = {
  id: 'p-1', sku: 'COLA', name: 'Cola 1L', unit: 'un',
} as ProductRow

const movement = (over: Partial<MovementRow> = {}): MovementRow => ({
  id: 'm-1', type: 'in', delta: 10, reason: 'Compra', createdAt: '2026-11-01T15:00:00.000Z',
  userName: 'Ana Pérez', ...over,
})

// `use()` suspende el componente: React exige renderizar dentro de `await act(...)` para poder
// reintentar el dibujo cuando la promesa se resuelve.
const renderSheet = (history: Promise<HistoryResult> | null) =>
  act(async () => {
    render(<HistorySheet open onOpenChange={() => {}} product={product} history={history} />)
  })

afterEach(cleanup)

describe('HistorySheet', () => {
  it('muestra el producto y un esqueleto mientras carga', async () => {
    await renderSheet(new Promise(() => {})) // nunca se resuelve
    expect(screen.getByText('Cola 1L · COLA')).toBeTruthy()
    expect(screen.getByLabelText('Cargando historial')).toBeTruthy()
  })

  it('lista los movimientos con tipo, cantidad con signo, motivo, autor y fecha', async () => {
    await renderSheet(
      Promise.resolve({
        error: '',
        items: [
          movement(),
          movement({ id: 'm-2', type: 'out', delta: -3.5, reason: null, userName: null }),
          movement({ id: 'm-3', type: 'adjustment', delta: -1.5, reason: 'Merma' }),
        ],
      }),
    )

    expect(await screen.findByText('+10 un')).toBeTruthy()
    expect(screen.getByText('-3,5 un')).toBeTruthy()
    expect(screen.getByText('-1,5 un')).toBeTruthy()
    expect(screen.getByText('Entrada')).toBeTruthy()
    expect(screen.getByText('Salida')).toBeTruthy()
    expect(screen.getByText('Ajuste')).toBeTruthy()
    expect(screen.getByText('Compra')).toBeTruthy()
    expect(screen.getByText('Merma')).toBeTruthy()
    expect(screen.getAllByText(/Ana Pérez ·/)).toHaveLength(2) // la entrada y el ajuste
    expect(screen.getByText(/Usuario desconocido ·/)).toBeTruthy()
  })

  it('colorea las entradas y las salidas de forma distinta', async () => {
    await renderSheet(
      Promise.resolve({ error: '', items: [movement(), movement({ id: 'm-2', type: 'out', delta: -2 })] }),
    )
    expect((await screen.findByText('+10 un')).className).toContain('emerald')
    expect(screen.getByText('-2 un').className).toContain('destructive')
  })

  it('sin movimientos lo dice', async () => {
    await renderSheet(Promise.resolve({ error: '', items: [] }))
    expect(await screen.findByText('Aún no hay movimientos.')).toBeTruthy()
  })

  it('si falla la carga muestra el error', async () => {
    await renderSheet(Promise.resolve({ error: 'No se pudo cargar el historial', items: [] }))
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo cargar el historial')
  })

  it('avisa cuando el historial llega al límite de movimientos mostrados', async () => {
    const items = Array.from({ length: 50 }, (_, i) => movement({ id: `m-${i}` }))
    await renderSheet(Promise.resolve({ error: '', items }))
    expect(await screen.findByText('Se muestran los últimos 50 movimientos.')).toBeTruthy()
  })

  it('no muestra ese aviso si hay menos del límite', async () => {
    await renderSheet(Promise.resolve({ error: '', items: [movement()] }))
    await screen.findByText('+10 un')
    expect(screen.queryByText(/Se muestran los últimos/)).toBeNull()
  })
})
