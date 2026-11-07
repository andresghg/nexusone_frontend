import { redirect } from 'next/navigation'
import { InventoryView } from '@/features/inventory/components/InventoryView'
import { categoryService } from '@/features/inventory/services/CategoryService'
import { productService } from '@/features/inventory/services/ProductService'
import {
  PAGE_SIZE,
  buildInventoryQuery,
  parseInventoryParams,
  toFilters,
} from '@/features/inventory/utils/inventoryParams'
import {
  getCurrentAccess,
  requirePermission,
} from '@/features/organization/utils/getCurrentAccess'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function InventoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  await requirePermission(slug, 'pos.inventario.read')

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization, permissions } = await getCurrentAccess(slug)
  const query = parseInventoryParams(await searchParams)

  const [{ rows, total }, categories] = await Promise.all([
    productService.list(user.id, organization.id, toFilters(query), {
      page: query.page,
      pageSize: PAGE_SIZE,
    }),
    categoryService.list(user.id, organization.id),
  ])

  // Una página fuera de rango (p. ej. tras archivar el último producto de la última página)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (query.page > lastPage) {
    redirect(`/dashboard/${slug}/pos/inventario${buildInventoryQuery({ ...query, page: lastPage })}`)
  }

  return (
    <InventoryView
      organizationId={organization.id}
      products={rows}
      total={total}
      categories={categories}
      query={query}
      pageSize={PAGE_SIZE}
      canWrite={permissions.includes('pos.inventario.write')}
    />
  )
}
