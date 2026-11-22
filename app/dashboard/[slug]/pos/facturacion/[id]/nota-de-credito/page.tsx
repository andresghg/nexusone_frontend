import Link from 'next/link'
import { notFound } from 'next/navigation'
import z from 'zod'
import { ArrowLeft } from 'lucide-react'
import { CreditNoteForm } from '@/features/billing/components/CreditNoteForm'
import { invoiceService } from '@/features/billing/services/InvoiceService'
import { ANY_DOCUMENT_TYPE_LABELS } from '@/features/billing/types/billing'
import { formatDocumentNumber } from '@/features/billing/utils/documentNumber'
import { getCurrentAccess, requirePermission } from '@/features/organization/utils/getCurrentAccess'

export default async function CreditNotePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  // Corregir un documento emitido es una acción de supervisión: el mismo permiso que anular
  await requirePermission(slug, 'pos.facturacion.void')

  // Un id que no es un UUID no puede existir: ni se consulta la base
  if (!z.uuid().safeParse(id).success) notFound()

  // El id de la empresa sale del slug ya validado contra la membresía, no del cliente
  const { user, organization } = await getCurrentAccess(slug)
  const result = await invoiceService.getCreditContext(user.id, organization.id, id)
  // No existe, no está emitido, es una nota o es de otra empresa: la pantalla no aplica
  if (!result) notFound()

  const { context, display } = result
  const basePath = `/dashboard/${slug}/pos/facturacion`
  const label = `${ANY_DOCUMENT_TYPE_LABELS[context.invoice.documentType]} ${formatDocumentNumber(display.documentPrefixes, context.invoice.documentType, context.invoice.number)}`

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <Link
          href={`${basePath}/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {label}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nota de crédito sobre {label}</h1>
        <p className="text-sm text-muted-foreground">
          Corrige el documento sin anularlo: acredita solo las líneas y cantidades que elijas.
        </p>
      </header>

      <CreditNoteForm organizationId={organization.id} context={context} display={display} basePath={basePath} />
    </div>
  )
}
