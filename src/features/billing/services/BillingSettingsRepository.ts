import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { billingSettings } from '@/db/schema'
import {
  DEFAULT_BILLING_SETTINGS,
  type BillingSettings,
  type DocumentPrefixes,
} from '../types/billing'

export interface IBillingSettingsRepository {
  /** null = la empresa aún no configuró nada (rigen los valores por defecto). */
  find(organizationId: string): Promise<BillingSettings | null>
  save(organizationId: string, settings: BillingSettings): Promise<void>
}

class BillingSettingsRepository implements IBillingSettingsRepository {
  async find(organizationId: string) {
    const [row] = await db
      .select()
      .from(billingSettings)
      .where(eq(billingSettings.organizationId, organizationId))
      .limit(1)
    if (!row) return null

    return {
      currency: row.currency,
      currencyDecimals: row.currencyDecimals,
      locale: row.locale,
      timezone: row.timezone,
      taxName: row.taxName,
      taxRate: Number(row.taxRate), // numeric llega como texto
      pricesIncludeTax: row.pricesIncludeTax,
      allowNegativeStock: row.allowNegativeStock,
      defaultDueDays: row.defaultDueDays,
      // Si algún tipo faltara en el JSON, se completa con el valor por defecto
      documentPrefixes: {
        ...DEFAULT_BILLING_SETTINGS.documentPrefixes,
        ...row.documentPrefixes,
      } as DocumentPrefixes,
    }
  }

  async save(organizationId: string, settings: BillingSettings) {
    const values = { ...settings, taxRate: settings.taxRate.toFixed(2) }
    await db
      .insert(billingSettings)
      .values({ organizationId, ...values })
      .onConflictDoUpdate({
        target: billingSettings.organizationId,
        set: { ...values, updatedAt: new Date() },
      })
  }
}

export const billingSettingsRepository = new BillingSettingsRepository()
