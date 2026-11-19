import { redirect } from 'next/navigation'
import { CustomersView } from '@/features/customers/components/CustomersView'
import { customerService } from '@/features/customers/services/CustomerService'
import {
  PAGE_SIZE,
  buildCustomersQuery,
  parseCustomerParams,
  toFilters,
} from '@/features/customers/utils/customerParams'
import {
  getCurrentAccess,
  requirePermission,
} from '@/features/organization/utils/getCurrentAccess'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CustomersPage({ params, searchParams }: Props) {
  const { slug } = await params
  await requirePermission(slug, 'pos.clientes.read')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization, permissions } = await getCurrentAccess(slug)
  const query = parseCustomerParams(await searchParams)

  const { rows, total } = await customerService.list(user.id, organization.id, toFilters(query), {
    page: query.page,
    pageSize: PAGE_SIZE,
  })

  // Una página fuera de rango (p. ej. tras archivar al último cliente de la última página)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (query.page > lastPage) {
    redirect(`/dashboard/${slug}/pos/clientes${buildCustomersQuery({ ...query, page: lastPage })}`)
  }

  return (
    <CustomersView
      organizationId={organization.id}
      customers={rows}
      total={total}
      query={query}
      pageSize={PAGE_SIZE}
      canWrite={permissions.includes('pos.clientes.write')}
    />
  )
}
