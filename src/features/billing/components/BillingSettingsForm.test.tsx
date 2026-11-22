// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateBillingSettingsAction } from '../action/billing-settings-action'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '../types/billing'
import { BillingSettingsForm } from './BillingSettingsForm'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('../action/billing-settings-action', () => ({ updateBillingSettingsAction: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const ORG = '11111111-1111-4111-8111-111111111111'
const save = vi.mocked(updateBillingSettingsAction)

const setup = (settings: BillingSettings = structuredClone(DEFAULT_BILLING_SETTINGS)) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<BillingSettingsForm organizationId={ORG} settings={settings} />)
  return user
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const replace = async (user: ReturnType<typeof userEvent.setup>, label: string, value: string) => {
  await user.clear(field(label))
  if (value) await user.type(field(label), value)
}
const saveButton = () => screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement
const discardButton = () => screen.getByRole('button', { name: 'Descartar' }) as HTMLButtonElement
const preview = () => within(screen.getByRole('group', { name: 'Ejemplo con esta configuración' }))
const pesos = (amount: string) => new RegExp(`\\$\\s?${amount.replace('.', '\\.')}$`)

beforeEach(() => {
  save.mockReset()
  refresh.mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(cleanup)

describe('BillingSettingsForm · valores', () => {
  it('muestra la configuración guardada', () => {
    setup()
    expect(field('Moneda').value).toBe('CLP')
    expect(field('Idioma y región').value).toBe('es-CL')
    expect(field('Zona horaria').value).toBe('America/Santiago')
    expect(field('Nombre del impuesto').value).toBe('IVA')
    expect(field('Tasa por defecto (%)').value).toBe('19')
    expect(field('Plazo de pago por defecto (días)').value).toBe('0')
    expect(field('Factura').value).toBe('F')
    expect(field('Recibo').value).toBe('R')
    expect(field('Nota de venta').value).toBe('NV')
    expect(screen.getByRole('switch', { name: 'Los precios ya incluyen el impuesto' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Permitir vender sin stock suficiente' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('combobox', { name: 'Decimales' }).textContent).toBe('Sin decimales')
  })

  it('sin cambios, guardar y descartar están deshabilitados y dice "Todo guardado"', () => {
    setup()
    expect(saveButton().disabled).toBe(true)
    expect(discardButton().disabled).toBe(true)
    expect(screen.getByText('Todo guardado')).toBeTruthy()
  })

  it('al editar se habilitan los botones y avisa de los cambios sin guardar', async () => {
    const user = setup()
    await replace(user, 'Nombre del impuesto', 'VAT')
    expect(saveButton().disabled).toBe(false)
    expect(discardButton().disabled).toBe(false)
    expect(screen.getByText('Tienes cambios sin guardar')).toBeTruthy()
  })

  it('sugiere los decimales habituales de la moneda y el ejemplo de numeración', async () => {
    const user = setup()
    expect(screen.getByText('Para CLP lo habitual es no usar decimales.')).toBeTruthy()
    expect(screen.getByText('Ejemplo: F-000001')).toBeTruthy()

    await replace(user, 'Moneda', 'usd')
    expect(screen.getByText('Para USD lo habitual es 2 decimales.')).toBeTruthy()

    await replace(user, 'Factura', 'fac')
    expect(screen.getByText('Ejemplo: FAC-000001')).toBeTruthy()
  })
})

describe('BillingSettingsForm · ejemplo en vivo', () => {
  it('con impuesto incluido: el total es el precio y se separa el neto', () => {
    setup()
    expect(preview().getByText(/ya incluye el impuesto/)).toBeTruthy()
    expect(preview().getByText('Neto').nextElementSibling?.textContent).toMatch(pesos('8.403'))
    expect(preview().getByText('IVA (19%)').nextElementSibling?.textContent).toMatch(pesos('1.597'))
    expect(preview().getByText('Total a pagar').nextElementSibling?.textContent).toMatch(pesos('10.000'))
  })

  it('al apagar "precios con impuesto incluido" el impuesto se suma al precio', async () => {
    const user = setup()
    await user.click(screen.getByRole('switch', { name: 'Los precios ya incluyen el impuesto' }))

    expect(preview().getByText(/se vende más el impuesto/)).toBeTruthy()
    expect(preview().getByText('Neto').nextElementSibling?.textContent).toMatch(pesos('10.000'))
    expect(preview().getByText('Total a pagar').nextElementSibling?.textContent).toMatch(pesos('11.900'))
  })

  it('se actualiza con el nombre y la tasa del impuesto', async () => {
    const user = setup()
    await replace(user, 'Nombre del impuesto', 'VAT')
    await replace(user, 'Tasa por defecto (%)', '10')

    expect(preview().getByText('VAT (10%)')).toBeTruthy()
    expect(preview().getByText('Total a pagar').nextElementSibling?.textContent).toMatch(pesos('10.000'))
    expect(preview().getByText('Neto').nextElementSibling?.textContent).toMatch(pesos('9.091'))
  })

  it('con una tasa vacía pide completar los datos en lugar de mostrar números inválidos', async () => {
    const user = setup()
    await replace(user, 'Tasa por defecto (%)', '')
    expect(preview().getByText(/Completa la moneda, los decimales y la tasa/)).toBeTruthy()
    expect(preview().queryByText('Total a pagar')).toBeNull()
  })

  it('con una moneda a medias no se rompe: muestra el número con el código', async () => {
    const user = setup()
    await replace(user, 'Moneda', 'US')
    expect(preview().getByText('Total a pagar').nextElementSibling?.textContent).toBe('10000 US')
  })
})

describe('BillingSettingsForm · guardar', () => {
  it('con un dato inválido muestra el error en el campo y no envía', async () => {
    const user = setup()
    await replace(user, 'Moneda', '')
    await user.click(saveButton())

    const message = await screen.findByText('Usa el código de 3 letras de la moneda (ej. CLP, USD)')
    expect(message.getAttribute('role')).toBe('alert')
    expect(field('Moneda').getAttribute('aria-invalid')).toBe('true')
    expect(save).not.toHaveBeenCalled()
  })

  it('rechaza prefijos repetidos', async () => {
    const user = setup()
    await replace(user, 'Recibo', 'F')
    await user.click(saveButton())

    expect(await screen.findByText('Los prefijos de cada tipo de documento deben ser distintos')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('la nota de crédito tiene su propio prefijo (NC por defecto) con su ejemplo', async () => {
    const user = setup()
    expect(field('Nota de crédito').value).toBe('NC')
    expect(screen.getByText('Ejemplo: NC-000001')).toBeTruthy()
    await replace(user, 'Nota de crédito', 'cr')
    expect(screen.getByText('Ejemplo: CR-000001')).toBeTruthy()
  })

  it('una empresa anterior a las notas de crédito (sin ese prefijo) lo recibe de fábrica y puede guardar', async () => {
    save.mockResolvedValue({ error: '', success: 'Configuración guardada' })
    const { credit_note: _omit, ...legacy } = DEFAULT_BILLING_SETTINGS.documentPrefixes
    const user = setup({ ...structuredClone(DEFAULT_BILLING_SETTINGS), documentPrefixes: legacy as never })
    expect(field('Nota de crédito').value).toBe('NC')
    await replace(user, 'Plazo de pago por defecto (días)', '15')
    await user.click(saveButton())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0].documentPrefixes).toEqual({ invoice: 'F', receipt: 'R', sales_note: 'NV', credit_note: 'NC' })
  })

  it('el prefijo de la nota de crédito no puede repetir el de otro documento', async () => {
    const user = setup()
    await replace(user, 'Nota de crédito', 'F')
    await user.click(saveButton())
    expect(await screen.findByText('Los prefijos de cada tipo de documento deben ser distintos')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('envía la empresa y los valores normalizados con los tipos correctos', async () => {
    save.mockResolvedValue({ error: '', success: 'Configuración guardada' })
    const user = setup()

    await replace(user, 'Moneda', 'usd')
    await user.click(screen.getByRole('combobox', { name: 'Decimales' }))
    await user.click(await screen.findByRole('option', { name: '2 decimales' }))
    await replace(user, 'Tasa por defecto (%)', '10.5')
    await replace(user, 'Plazo de pago por defecto (días)', '30')
    await user.click(screen.getByRole('switch', { name: 'Permitir vender sin stock suficiente' }))
    await user.click(saveButton())

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith({
      ...DEFAULT_BILLING_SETTINGS,
      organizationId: ORG,
      currency: 'USD', // normalizado a mayúsculas
      currencyDecimals: 2, // número, no texto
      taxRate: 10.5,
      defaultDueDays: 30,
      allowNegativeStock: true,
    })
  })

  it('al guardar avisa, refresca y deja el formulario sin cambios pendientes', async () => {
    save.mockResolvedValue({ error: '', success: 'Configuración guardada' })
    const user = setup()

    await replace(user, 'Moneda', 'usd')
    await user.click(saveButton())

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Configuración guardada'))
    expect(refresh).toHaveBeenCalled()
    await waitFor(() => expect(saveButton().disabled).toBe(true))
    expect(screen.getByText('Todo guardado')).toBeTruthy()
    expect(field('Moneda').value).toBe('USD')
  })

  it('si el guardado falla avisa y conserva los cambios para reintentar', async () => {
    save.mockResolvedValue({ error: 'No tienes permisos para configurar la facturación', success: '' })
    const user = setup()

    await replace(user, 'Nombre del impuesto', 'VAT')
    await user.click(saveButton())

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No tienes permisos para configurar la facturación'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByText('Tienes cambios sin guardar')).toBeTruthy()
    expect(saveButton().disabled).toBe(false)
    expect(field('Nombre del impuesto').value).toBe('VAT')
  })
})

describe('BillingSettingsForm · descartar', () => {
  it('restaura los valores guardados', async () => {
    const user = setup()
    await replace(user, 'Moneda', 'EUR')
    await replace(user, 'Nombre del impuesto', 'VAT')
    await user.click(discardButton())

    expect(field('Moneda').value).toBe('CLP')
    expect(field('Nombre del impuesto').value).toBe('IVA')
    expect(saveButton().disabled).toBe(true)
  })
})
