import { billingSettingsRepository, type IBillingSettingsRepository } from '@/features/billing/services/BillingSettingsRepository'
import { DEFAULT_BILLING_SETTINGS } from '@/features/billing/types/billing'
import { addDays, todayInTimezone } from '@/features/billing/utils/dates'
import { accessService, type IAccessResolver } from '@/features/organization/services/AccessService'
import { DUE_SOON_DAYS, type DueSummary } from '../types/notification'
import { notificationRepository, type INotificationRepository } from './NotificationRepository'

export class NotificationService {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly settings: IBillingSettingsRepository,
    private readonly access: IAccessResolver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Lo vencido y lo que vence pronto, para la campana. Lo ve quien puede ver facturación (null si no).
   * Es un adorno del layout: si la consulta falla devuelve null y la campana queda sin avisos de cobro,
   * en vez de tumbar todas las pantallas del dashboard.
   */
  async dueSummary(userId: string, organizationId: string): Promise<DueSummary | null> {
    try {
      const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.read')
      if (!access) return null

      const settings = (await this.settings.find(access.organizationId)) ?? DEFAULT_BILLING_SETTINGS
      const today = todayInTimezone(this.now(), settings.timezone)
      // "Por vencer" = hoy y los próximos días: hoy más DUE_SOON_DAYS − 1 días hacia adelante
      const row = await this.notifications.dueSummary(access.organizationId, today, addDays(today, DUE_SOON_DAYS - 1))

      return {
        display: {
          currency: settings.currency,
          currencyDecimals: settings.currencyDecimals,
          locale: settings.locale,
          timezone: settings.timezone,
        },
        today,
        overdue: { documents: row.overdueDocuments, amount: row.overdueAmount },
        dueSoon: { documents: row.dueSoonDocuments, amount: row.dueSoonAmount, nextDueDate: row.nextDueDate },
      }
    } catch (error) {
      console.error('[notificaciones] no se pudo calcular lo vencido', error)
      return null
    }
  }
}

export const notificationService = new NotificationService(notificationRepository, billingSettingsRepository, accessService)
