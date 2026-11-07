import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { getSessionUser } from '@/features/organization/utils/getSessionUser'
import { OrganizationForm } from '@/features/organization/components/OrganizationForm'
import { organizationRepository } from '@/features/organization/services/OrganizationRepository'
import { organizationService } from '@/features/organization/services/OrganizationService'

export default async function NewOrganizationPage() {
  const user = await getSessionUser()
  const [status, organizations] = await Promise.all([
    organizationService.getCreationStatus(user.id),
    organizationRepository.findAllByUserId(user.id),
  ])

  // No puede crear: se lo decimos antes de hacerle llenar el formulario
  if (!status.allowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">No puedes crear más empresas</h1>
        <p className="text-sm text-muted-foreground">{status.reason}</p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Volver al panel</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Quien ya tiene empresas puede volver; el primer registro no tiene a dónde */}
      {organizations.length > 0 && (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver
        </Link>
      )}
      <OrganizationForm organization={null} />
    </div>
  )
}