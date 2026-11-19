import { notFound } from 'next/navigation'
import z from 'zod'
import { InvoiceDetailView } from '@/features/billing/components/InvoiceDetailView'
import { invoiceService } from '@/features/billing/services/InvoiceService'
import {
  getCurrentAccess,
  requirePermission,
} from '@/features/organization/utils/getCurrentAccess'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  await requirePermission(slug, 'pos.facturacion.read')

  // Un id que no es un UUID no puede existir: ni se consulta la base
  if (!z.uuid().safeParse(id).success) notFound()

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization, permissions } = await getCurrentAccess(slug)
  const result = await invoiceService.getDetail(user.id, organization.id, id)
  if (!result) notFound()

  return (
    <InvoiceDetailView
      organizationId={organization.id}
      detail={result.detail}
      display={result.display}
      listHref={`/dashboard/${slug}/pos/facturacion`}
      canCollect={permissions.includes('pos.facturacion.create')}
      canVoid={permissions.includes('pos.facturacion.void')}
    />
  )
}
