import type { DisplayFormat } from '@/features/billing/types/billing'

/** Cuántos días hacia adelante se avisa que un documento está por vencer (hoy incluido). */
export const DUE_SOON_DAYS = 3

export type NotificationKind = 'overdue' | 'due_soon' | 'low_stock'
export type NotificationSeverity = 'critical' | 'warning'

/** Lo que muestra la campana. Serializable: viaja del layout (servidor) al navbar (cliente). */
export type AppNotification = {
  id: NotificationKind
  severity: NotificationSeverity
  title: string
  description: string
  href: string
}

export type DueGroup = { documents: number; amount: number }

/** Documentos con saldo que ya vencieron o vencen pronto, con el formato y el "hoy" de la empresa. */
export type DueSummary = {
  display: DisplayFormat
  today: string
  overdue: DueGroup
  dueSoon: DueGroup & { nextDueDate: string | null }
}
