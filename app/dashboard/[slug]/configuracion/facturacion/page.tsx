import { redirect } from 'next/navigation'
import { BillingSettingsForm } from '@/features/billing/components/BillingSettingsForm'
import { billingSettingsService } from '@/features/billing/services/BillingSettingsService'
import {
  getCurrentAccess,
  requirePermission,
} from '@/features/organization/utils/getCurrentAccess'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requirePermission(slug, 'pos.facturacion.configure')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization } = await getCurrentAccess(slug)
  const settings = await billingSettingsService.get(user.id, organization.id)
  if (!settings) redirect(`/dashboard/${slug}`)

  return (
    <div className="mx-auto max-w-4xl">
      <header className="space-y-1 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
        <p className="text-sm text-muted-foreground">
          Moneda, impuestos y numeración de tus documentos. Los cambios se aplican a los documentos que
          emitas desde ahora; los ya emitidos conservan los datos con que se crearon.
        </p>
      </header>
      <BillingSettingsForm organizationId={organization.id} settings={settings} />
    </div>
  )
}
