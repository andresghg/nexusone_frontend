import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from '@/features/billing/types/billing'
import { NotificationService } from './NotificationService'
import type { DueRow, INotificationRepository } from './NotificationRepository'

const ORG = 'org-1'
const row: DueRow = { overdueDocuments: 2, overdueAmount: 300, dueSoonDocuments: 1, dueSoonAmount: 50, nextDueDate: '2026-11-26' }

const setup = (over: { allowed?: boolean; settings?: BillingSettings | null; now?: string; fail?: boolean } = {}) => {
  const dueSummary = vi.fn<INotificationRepository['dueSummary']>(async () => {
    if (over.fail) throw new Error('db caída')
    return row
  })
  const authorize = vi.fn(async (_u: string, org: string) => (over.allowed === false ? null : ({ organizationId: org, role: 'member', permissions: [] } as never)))
  const settings = { find: vi.fn(async () => (over.settings === undefined ? { ...DEFAULT_BILLING_SETTINGS } : over.settings)), save: vi.fn() }
  const service = new NotificationService({ dueSummary }, settings as never, { authorize }, () => new Date(over.now ?? '2026-11-25T15:00:00Z'))
  return { service, dueSummary, authorize }
}

describe('NotificationService.dueSummary', () => {
  it('exige el permiso de lectura de facturación', async () => {
    const { service, authorize, dueSummary } = setup()
    await service.dueSummary('u1', ORG)
    expect(authorize).toHaveBeenCalledWith('u1', ORG, 'pos.facturacion.read')
    expect(dueSummary).toHaveBeenCalledTimes(1)
  })

  it('sin permiso devuelve null y no consulta la base', async () => {
    const { service, dueSummary } = setup({ allowed: false })
    expect(await service.dueSummary('u1', ORG)).toBeNull()
    expect(dueSummary).not.toHaveBeenCalled()
  })

  it('consulta con la empresa autorizada, el "hoy" de la empresa y una ventana de 3 días contando hoy', async () => {
    const { service, dueSummary } = setup()
    await service.dueSummary('u1', ORG)
    expect(dueSummary).toHaveBeenCalledWith(ORG, '2026-11-25', '2026-11-27')
  })

  it('el "hoy" sigue la zona horaria de la empresa, no la del servidor', async () => {
    // 02:00 UTC del 26 son las 23:00 del 25 en Santiago (UTC−3)
    const { service, dueSummary } = setup({ now: '2026-11-26T02:00:00Z', settings: { ...DEFAULT_BILLING_SETTINGS, timezone: 'America/Santiago' } })
    const summary = await service.dueSummary('u1', ORG)
    expect(summary?.today).toBe('2026-11-25')
    expect(dueSummary).toHaveBeenCalledWith(ORG, '2026-11-25', '2026-11-27')
  })

  it('devuelve el resumen con el formato de la empresa', async () => {
    const { service } = setup({ settings: { ...DEFAULT_BILLING_SETTINGS, currency: 'USD', currencyDecimals: 2, locale: 'en-US' } })
    expect(await service.dueSummary('u1', ORG)).toEqual({
      display: { currency: 'USD', currencyDecimals: 2, locale: 'en-US', timezone: DEFAULT_BILLING_SETTINGS.timezone },
      today: '2026-11-25',
      overdue: { documents: 2, amount: 300 },
      dueSoon: { documents: 1, amount: 50, nextDueDate: '2026-11-26' },
    })
  })

  it('sin configuración de facturación usa los valores de fábrica', async () => {
    const { service } = setup({ settings: null })
    const summary = await service.dueSummary('u1', ORG)
    expect(summary?.display.currency).toBe(DEFAULT_BILLING_SETTINGS.currency)
  })

  it('si la consulta falla devuelve null (la campana no tumba el dashboard) y deja constancia en el servidor', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { service } = setup({ fail: true })
    expect(await service.dueSummary('u1', ORG)).toBeNull()
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})
