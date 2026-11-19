import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import { updateBillingSettingsAction } from './billing-settings-action'

const { update, getAuthUserId, revalidatePath } = vi.hoisted(() => ({
  update: vi.fn(),
  getAuthUserId: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('../services/BillingSettingsService', () => ({ billingSettingsService: { update } }))
vi.mock('@/lib/supabase/get-user-id', () => ({ getAuthUserId }))
vi.mock('next/cache', () => ({ revalidatePath }))

const ORG = '11111111-1111-4111-8111-111111111111'
const input = (over = {}) => ({ ...structuredClone(DEFAULT_BILLING_SETTINGS), organizationId: ORG, ...over })

beforeEach(() => {
  update.mockReset()
  getAuthUserId.mockReset().mockResolvedValue('user-1')
  revalidatePath.mockReset()
})

describe('updateBillingSettingsAction', () => {
  it('datos inválidos: devuelve el primer mensaje y no toca el servicio', async () => {
    const result = await updateBillingSettingsAction(input({ currencyDecimals: 3 }))
    expect(result).toEqual({ error: 'Los decimales van de 0 a 2', success: '' })
    expect(update).not.toHaveBeenCalled()
    expect(getAuthUserId).not.toHaveBeenCalled()
  })

  it('una empresa inválida se rechaza', async () => {
    const result = await updateBillingSettingsAction(input({ organizationId: 'x' }))
    expect(result).toEqual({ error: 'Empresa inválida', success: '' })
    expect(update).not.toHaveBeenCalled()
  })

  it('sin sesión no guarda', async () => {
    getAuthUserId.mockResolvedValue(undefined)
    expect(await updateBillingSettingsAction(input())).toEqual({ error: 'Sesión no válida', success: '' })
    expect(update).not.toHaveBeenCalled()
  })

  it('guarda con el usuario de la sesión y separa la empresa de la configuración', async () => {
    update.mockResolvedValue({ error: '', success: 'Configuración guardada' })
    const result = await updateBillingSettingsAction(input({ currency: 'usd', currencyDecimals: 2 }))

    expect(result).toEqual({ error: '', success: 'Configuración guardada' })
    expect(update).toHaveBeenCalledWith('user-1', ORG, {
      ...DEFAULT_BILLING_SETTINGS,
      currency: 'USD', // normalizado por el schema
      currencyDecimals: 2,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[slug]/configuracion/facturacion', 'page')
  })

  it('si el servicio rechaza (sin permisos) devuelve su error y no revalida', async () => {
    update.mockResolvedValue({ error: 'No tienes permisos para configurar la facturación', success: '' })
    const result = await updateBillingSettingsAction(input())
    expect(result.error).toBe('No tienes permisos para configurar la facturación')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si el servicio lanza, devuelve un mensaje genérico sin filtrar detalles', async () => {
    update.mockRejectedValue(new Error('connection refused 10.0.0.5'))
    expect(await updateBillingSettingsAction(input())).toEqual({
      error: 'No se pudo guardar la configuración',
      success: '',
    })
  })
})
