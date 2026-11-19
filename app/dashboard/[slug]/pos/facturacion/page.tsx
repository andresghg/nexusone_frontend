import { redirect } from 'next/navigation'
import { InvoicesView } from '@/features/billing/components/InvoicesView'
import { invoiceService } from '@/features/billing/services/InvoiceService'
import {
  PAGE_SIZE,
  buildInvoicesQuery,
  parseInvoiceParams,
  toFilters,
} from '@/features/billing/utils/invoiceParams'
import {
  getCurrentAccess,
  requirePermission,
} from '@/features/organization/utils/getCurrentAccess'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function InvoicesPage({ params, searchParams }: Props) {
  const { slug } = await params
  await requirePermission(slug, 'pos.facturacion.read')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization, permissions } = await getCurrentAccess(slug)
  const query = parseInvoiceParams(await searchParams)

  const { rows, total, display } = await invoiceService.list(user.id, organization.id, toFilters(query), {
    page: query.page,
    pageSize: PAGE_SIZE,
  })

  // Una página fuera de rango (p. ej. con un filtro nuevo que deja menos resultados)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (query.page > lastPage) {
    redirect(`/dashboard/${slug}/pos/facturacion${buildInvoicesQuery({ ...query, page: lastPage })}`)
  }

  return (
    <InvoicesView
      organizationId={organization.id}
      invoices={rows}
      display={display}
      total={total}
      query={query}
      pageSize={PAGE_SIZE}
      canCreate={permissions.includes('pos.facturacion.create')}
      canVoid={permissions.includes('pos.facturacion.void')}
      basePath={`/dashboard/${slug}/pos/facturacion`}
    />
  )
}
