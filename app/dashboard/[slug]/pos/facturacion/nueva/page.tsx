import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { NewInvoiceForm } from '@/features/billing/components/NewInvoiceForm'
import { billingSettingsService } from '@/features/billing/services/BillingSettingsService'
import { todayInTimezone } from '@/features/billing/utils/dates'
import {
  getCurrentAccess,
  requirePermission,
} from '@/features/organization/utils/getCurrentAccess'

export default async function NewInvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requirePermission(slug, 'pos.facturacion.create')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization, permissions } = await getCurrentAccess(slug)
  const settings = await billingSettingsService.get(user.id, organization.id)
  if (!settings) redirect(`/dashboard/${slug}`)

  const listHref = `/dashboard/${slug}/pos/facturacion`

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Facturación
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva factura</h1>
      </header>

      <NewInvoiceForm
        organizationId={organization.id}
        settings={settings}
        today={todayInTimezone(new Date(), settings.timezone)}
        listHref={listHref}
        canAdjust={permissions.includes('pos.facturacion.adjust')}
        canCreateCustomer={permissions.includes('pos.clientes.write')}
      />
    </div>
  )
}
