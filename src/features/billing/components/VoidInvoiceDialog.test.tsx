// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { voidInvoiceAction } from '../action/invoice-action'
import { VoidInvoiceDialog } from './VoidInvoiceDialog'

vi.mock('../action/invoice-action', () => ({ voidInvoiceAction: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const ORG = '11111111-1111-4111-8111-111111111111'
const INVOICE = '55555555-5555-4555-8555-555555555555'
const action = vi.mocked(voidInvoiceAction)

const setup = () => {
  const onOpenChange = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <VoidInvoiceDialog open onOpenChange={onOpenChange} organizationId={ORG} invoiceId={INVOICE} documentLabel="F-000012" />,
  )
  return { user, onOpenChange }
}

const reasonField = () => screen.getByLabelText('Motivo de la anulación') as HTMLTextAreaElement
const submit = () => screen.getByRole('button', { name: 'Anular documento' })

beforeEach(() => {
  action.mockReset()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('VoidInvoiceDialog', () => {
  it('nombra el documento y avisa de las consecuencias', () => {
    setup()
    expect(screen.getByRole('dialog').textContent).toContain('Anular F-000012')
    expect(screen.getByText(/vuelve al inventario/)).toBeTruthy()
    expect(screen.getByText(/no se puede deshacer/)).toBeTruthy()
  })

  it('sin motivo muestra el error y no anula', async () => {
    const { user } = setup()
    await user.click(submit())

    const message = await screen.findByText('Indica el motivo de la anulación')
    expect(message.getAttribute('role')).toBe('alert')
    expect(reasonField().getAttribute('aria-invalid')).toBe('true')
    expect(action).not.toHaveBeenCalled()
  })

  it('un motivo demasiado corto tampoco sirve', async () => {
    const { user } = setup()
    await user.type(reasonField(), ' ab ')
    await user.click(submit())
    expect(await screen.findByText('Indica el motivo de la anulación')).toBeTruthy()
    expect(action).not.toHaveBeenCalled()
  })

  it('anula con el documento, la empresa y el motivo, avisa y cierra', async () => {
    action.mockResolvedValue({ error: '', success: 'Documento anulado: F-000012' })
    const { user, onOpenChange } = setup()

    await user.type(reasonField(), 'Error de digitación')
    await user.click(submit())

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(action).toHaveBeenCalledWith({ organizationId: ORG, invoiceId: INVOICE, reason: 'Error de digitación' })
    expect(toast.success).toHaveBeenCalledWith('Documento anulado: F-000012')
  })

  it('si el servidor rechaza avisa y deja el diálogo abierto para corregir', async () => {
    action.mockResolvedValue({ error: 'El documento ya está anulado', success: '' })
    const { user, onOpenChange } = setup()

    await user.type(reasonField(), 'Duplicada')
    await user.click(submit())

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El documento ya está anulado'))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(reasonField().value).toBe('Duplicada')
  })

  it('si la petición falla del todo, mensaje genérico y no queda bloqueado', async () => {
    action.mockRejectedValue(new Error('red caída'))
    const { user, onOpenChange } = setup()

    await user.type(reasonField(), 'Duplicada')
    await user.click(submit())

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo anular el documento'))
    expect(onOpenChange).not.toHaveBeenCalled()
    await waitFor(() => expect((submit() as HTMLButtonElement).disabled).toBe(false))
  })

  it('cancelar cierra sin anular', async () => {
    const { user, onOpenChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(action).not.toHaveBeenCalled()
  })
})
