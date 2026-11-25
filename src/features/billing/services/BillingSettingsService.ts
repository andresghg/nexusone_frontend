import {
  accessService,
  type IAccessResolver,
} from '@/features/organization/services/AccessService'
import { BillingSettingsSchema } from '../schemas/billingSettingsSchema'
import { DEFAULT_BILLING_SETTINGS, type BillingSettings, type DisplayFormat } from '../types/billing'
import {
  billingSettingsRepository,
  type IBillingSettingsRepository,
} from './BillingSettingsRepository'

const fail = (error: string) => ({ error, success: '' })

export class BillingSettingsService {
  constructor(
    private settings: IBillingSettingsRepository,
    private access: IAccessResolver,
  ) {}

  /** null = sin acceso. Una empresa sin configuración usa los valores por defecto. */
  async get(userId: string, organizationId: string): Promise<BillingSettings | null> {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.read')
    if (!access) return null
    return (await this.settings.find(access.organizationId)) ?? structuredClone(DEFAULT_BILLING_SETTINGS)
  }

  /**
   * Moneda, decimales, idioma y zona horaria de la empresa, para mostrar cifras y fechas. Solo estos cuatro datos
   * (no impuestos ni numeración), así que basta con poder leer inventario O facturación. null = sin acceso.
   */
  async getDisplayFormat(userId: string, organizationId: string): Promise<DisplayFormat | null> {
    const access =
      (await this.access.authorize(userId, organizationId, 'pos.facturacion.read')) ??
      (await this.access.authorize(userId, organizationId, 'pos.inventario.read'))
    if (!access) return null
    const { currency, currencyDecimals, locale, timezone } =
      (await this.settings.find(access.organizationId)) ?? DEFAULT_BILLING_SETTINGS
    return { currency, currencyDecimals, locale, timezone }
  }

  async update(userId: string, organizationId: string, input: BillingSettings) {
    const access = await this.access.authorize(userId, organizationId, 'pos.facturacion.configure')
    if (!access) return fail('No tienes permisos para configurar la facturación')

    // Defensa en profundidad: el schema del formulario ya lo valida, pero la regla vive aquí
    const parsed = BillingSettingsSchema.safeParse(input)
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Configuración inválida')

    await this.settings.save(access.organizationId, parsed.data)
    return { error: '', success: 'Configuración guardada' }
  }
}

export const billingSettingsService = new BillingSettingsService(
  billingSettingsRepository,
  accessService,
)
