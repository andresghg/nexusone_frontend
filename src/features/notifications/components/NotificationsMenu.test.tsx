// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppNotification } from '../types/notification'
import { NotificationsMenu } from './NotificationsMenu'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/' }))

afterEach(cleanup)

const overdue: AppNotification = { id: 'overdue', severity: 'critical', title: 'Facturas vencidas', description: '2 documentos con saldo vencido por $300', href: '/dashboard/a/pos/facturacion?payment=overdue' }
const lowStock: AppNotification = { id: 'low_stock', severity: 'warning', title: 'Stock bajo', description: '3 productos con stock igual o inferior al mínimo', href: '/dashboard/a/pos/inventario?low=1' }

describe('NotificationsMenu', () => {
  it('sin avisos: sin punto, nombre simple y mensaje de que no hay nada pendiente', async () => {
    render(<NotificationsMenu notifications={[]} />)
    const button = screen.getByRole('button', { name: 'Notificaciones' })
    expect(screen.queryByTestId('notifications-dot')).toBeNull()
    await userEvent.click(button)
    expect(screen.getByRole('status').textContent).toContain('No tienes notificaciones pendientes')
  })

  it('con avisos: el botón dice cuántos hay (no depende del punto de color)', () => {
    render(<NotificationsMenu notifications={[overdue, lowStock]} />)
    expect(screen.getByRole('button', { name: 'Notificaciones: 2 pendientes' })).toBeTruthy()
    expect(screen.getByTestId('notifications-dot')).toBeTruthy()
  })

  it('singular con un solo aviso', () => {
    render(<NotificationsMenu notifications={[lowStock]} />)
    expect(screen.getByRole('button', { name: 'Notificaciones: 1 pendiente' })).toBeTruthy()
  })

  it('el punto es rojo si hay algo crítico y ámbar si no', () => {
    const { rerender } = render(<NotificationsMenu notifications={[overdue]} />)
    expect(screen.getByTestId('notifications-dot').className).toContain('bg-destructive')
    rerender(<NotificationsMenu notifications={[lowStock]} />)
    expect(screen.getByTestId('notifications-dot').className).toContain('bg-amber-500')
  })

  it('al abrir lista cada aviso con título, detalle y un enlace a donde se resuelve', async () => {
    render(<NotificationsMenu notifications={[overdue, lowStock]} />)
    await userEvent.click(screen.getByRole('button', { name: /Notificaciones/ }))

    const links = screen.getAllByRole('menuitem')
    expect(links).toHaveLength(2)
    expect(links[0].textContent).toContain('Facturas vencidas')
    expect(links[0].textContent).toContain('2 documentos con saldo vencido por $300')
    expect(links[0].getAttribute('href')).toBe('/dashboard/a/pos/facturacion?payment=overdue')
    expect(links[1].getAttribute('href')).toBe('/dashboard/a/pos/inventario?low=1')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
