import { formatMoney } from '@/features/billing/utils/formatMoney'
import { DUE_SOON_DAYS, type AppNotification, type DueSummary } from '../types/notification'

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

// Días enteros desde 1970 para una fecha de calendario YYYY-MM-DD (en UTC: ninguna zona la corre un día)
const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

/** "hoy", "mañana" o "en N días", contando desde el "hoy" de la empresa. */
export function relativeDay(today: string, date: string): string {
  const diff = Math.round(dayNumber(date) - dayNumber(today))
  if (diff <= 0) return 'hoy'
  if (diff === 1) return 'mañana'
  return `en ${diff} días`
}

export type BuildNotificationsInput = {
  basePath: string // /dashboard/<slug>
  lowStockCount: number // 0 si el usuario no ve inventario
  due: DueSummary | null // null si el usuario no ve facturación
}

/**
 * Las notificaciones se derivan del estado actual del negocio (no se guardan): si el problema se resuelve
 * —se cobra la factura, se repone el stock— la notificación desaparece sola. De más a menos urgente.
 */
export function buildNotifications({ basePath, lowStockCount, due }: BuildNotificationsInput): AppNotification[] {
  const list: AppNotification[] = []

  if (due) {
    const money = (amount: number) =>
      formatMoney(amount, { currency: due.display.currency, locale: due.display.locale, decimals: due.display.currencyDecimals })

    const { overdue, dueSoon } = due
    if (overdue.documents > 0) {
      list.push({
        id: 'overdue',
        severity: 'critical',
        title: 'Facturas vencidas',
        description: `${overdue.documents} ${plural(overdue.documents, 'documento con saldo vencido', 'documentos con saldo vencido')} por ${money(overdue.amount)}`,
        href: `${basePath}/pos/facturacion?payment=overdue`,
      })
    }

    if (dueSoon.documents > 0) {
      const first = dueSoon.nextDueDate ? relativeDay(due.today, dueSoon.nextDueDate) : null
      const description =
        dueSoon.documents === 1
          ? `1 documento vence ${first ?? `en los próximos ${DUE_SOON_DAYS} días`} por ${money(dueSoon.amount)}`
          : `${dueSoon.documents} documentos vencen en los próximos ${DUE_SOON_DAYS} días por ${money(dueSoon.amount)}${first ? `; el primero vence ${first}` : ''}`
      list.push({ id: 'due_soon', severity: 'warning', title: 'Facturas por vencer', description, href: `${basePath}/pos/facturacion` })
    }
  }

  if (lowStockCount > 0) {
    list.push({
      id: 'low_stock',
      severity: 'warning',
      title: 'Stock bajo',
      description: `${lowStockCount} ${plural(lowStockCount, 'producto con stock igual o inferior al mínimo', 'productos con stock igual o inferior al mínimo')}`,
      href: `${basePath}/pos/inventario?low=1`,
    })
  }

  return list
}
