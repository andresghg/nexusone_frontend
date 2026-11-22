import { describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/types/navigation'
import type { IAccessResolver } from '@/features/organization/services/AccessService'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '../types/billing'
import { BillingSettingsService } from './BillingSettingsService'
import type { IBillingSettingsRepository } from './BillingSettingsRepository'

const ORG_ID = 'org-1'
const OTHER_ORG_ID = 'org-2'

const settings = (over: Partial<BillingSettings> = {}): BillingSettings => ({
  ...structuredClone(DEFAULT_BILLING_SETTINGS),
  ...over,
})

function setup(
  stored: BillingSettings | null = null,
  granted: Permission[] = ['pos.facturacion.read', 'pos.facturacion.configure'],
) {
  const repo = {
    find: vi.fn().mockResolvedValue(stored),
    save: vi.fn().mockResolvedValue(undefined),
  } satisfies IBillingSettingsRepository

  const access = {
    authorize: vi.fn(async (_userId: string, organizationId: string, permission: Permission) =>
      organizationId === ORG_ID && granted.includes(permission)
        ? { organizationId: ORG_ID, role: 'admin', permissions: granted }
        : null,
    ),
  } satisfies IAccessResolver

  return { repo, access, service: new BillingSettingsService(repo, access) }
}

describe('BillingSettingsService.get', () => {
  it('sin permiso de lectura devuelve null y no consulta la base', async () => {
    const { repo, service } = setup(null, [])
    expect(await service.get('u1', ORG_ID)).toBeNull()
    expect(repo.find).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { repo, service } = setup(settings({ taxName: 'VAT' }))
    expect(await service.get('u1', OTHER_ORG_ID)).toBeNull()
    expect(repo.find).not.toHaveBeenCalled()
  })

  it('una empresa sin configuración recibe los valores por defecto', async () => {
    const { repo, service } = setup(null)
    expect(await service.get('u1', ORG_ID)).toEqual(DEFAULT_BILLING_SETTINGS)
    expect(repo.find).toHaveBeenCalledWith(ORG_ID)
  })

  it('los valores por defecto son una copia: modificarlos no altera la constante', async () => {
    const { service } = setup(null)
    const first = await service.get('u1', ORG_ID)
    first!.documentPrefixes.invoice = 'XX'
    first!.taxRate = 1
    expect(DEFAULT_BILLING_SETTINGS.documentPrefixes.invoice).toBe('F')
    expect(DEFAULT_BILLING_SETTINGS.taxRate).toBe(19)
  })

  it('devuelve la configuración guardada', async () => {
    const stored = settings({ currency: 'USD', currencyDecimals: 2, taxName: 'VAT', taxRate: 21 })
    const { service } = setup(stored)
    expect(await service.get('u1', ORG_ID)).toEqual(stored)
  })

  it('leer solo requiere pos.facturacion.read', async () => {
    const { service } = setup(null, ['pos.facturacion.read'])
    expect(await service.get('u1', ORG_ID)).not.toBeNull()
  })
})

describe('BillingSettingsService.update', () => {
  it('sin permiso de configuración no guarda nada (leer no basta)', async () => {
    const { repo, service } = setup(null, ['pos.facturacion.read'])
    const result = await service.update('u1', ORG_ID, settings())
    expect(result).toEqual({ error: 'No tienes permisos para configurar la facturación', success: '' })
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('otra empresa: sin acceso', async () => {
    const { repo, service } = setup()
    const result = await service.update('u1', OTHER_ORG_ID, settings())
    expect(result.error).toBe('No tienes permisos para configurar la facturación')
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('guarda la configuración normalizada', async () => {
    const { repo, service } = setup()
    const result = await service.update(
      'u1',
      ORG_ID,
      settings({ currency: 'usd', currencyDecimals: 2, taxName: ' VAT ', taxRate: 21 }),
    )
    expect(result).toEqual({ error: '', success: 'Configuración guardada' })
    expect(repo.save).toHaveBeenCalledWith(
      ORG_ID,
      settings({ currency: 'USD', currencyDecimals: 2, taxName: 'VAT', taxRate: 21 }),
    )
  })

  it('rechaza una configuración inválida con el primer mensaje del schema', async () => {
    const { repo, service } = setup()
    const result = await service.update('u1', ORG_ID, settings({ currencyDecimals: 3 }))
    expect(result).toEqual({ error: 'Los decimales van de 0 a 2', success: '' })
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('rechaza prefijos repetidos', async () => {
    const { repo, service } = setup()
    const result = await service.update(
      'u1',
      ORG_ID,
      settings({ documentPrefixes: { invoice: 'F', receipt: 'F', sales_note: 'NV', credit_note: 'NC' } }),
    )
    expect(result.error).toBe('Los prefijos de cada tipo de documento deben ser distintos')
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('guarda siempre en la empresa autorizada', async () => {
    const { repo, access, service } = setup()
    await service.update('u1', ORG_ID, settings())
    expect(access.authorize).toHaveBeenCalledWith('u1', ORG_ID, 'pos.facturacion.configure')
    expect(repo.save.mock.calls[0][0]).toBe(ORG_ID)
  })
})
