import type { Metadata } from 'next'
import Link from 'next/link'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { generatePageTitle } from '@/shared/utils/metadata'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/features/organization/utils/getCurrentOrganization'
import { invitationService } from '@/features/organization/services/InvitationService'
import { InvitationAccept } from '@/features/organization/components/InvitationAccept'
import { ROLE_LABEL } from '@/features/organization/permissions'

export const metadata: Metadata = { title: generatePageTitle('Invitación') }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await invitationService.preview(token)

  if (!invitation) {
    return (
      <CardHeader>
        <CardTitle className="text-xl">Invitación no válida</CardTitle>
        <CardDescription>
          El enlace venció, ya fue usado o fue revocado. Pídele a quien te invitó que genere uno nuevo.
        </CardDescription>
      </CardHeader>
    )
  }

  const role = (ROLE_LABEL[invitation.role] ?? invitation.role).toLowerCase()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Sin sesión: elegir entre crear cuenta o iniciar sesión, conservando el enlace
  if (!user) {
    const next = encodeURIComponent(`/invitacion/${token}`)
    return (
      <>
        <CardHeader>
          <CardTitle className="text-xl">Te invitaron a {invitation.organizationName}</CardTitle>
          <CardDescription>
            Te unirás como {role}. Crea una cuenta o inicia sesión para aceptar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <Link href={`/auth/registrar?next=${next}`}>Crear cuenta</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/auth/login?next=${next}`}>Ya tengo cuenta</Link>
          </Button>
        </CardContent>
      </>
    )
  }

  // Con sesión pero ya en una empresa (regla: una empresa por usuario)
  const { organization } = await getCurrentOrganization()
  if (organization) {
    return (
      <>
        <CardHeader>
          <CardTitle className="text-xl">Ya perteneces a una empresa</CardTitle>
          <CardDescription>
            Para aceptar esta invitación necesitas una cuenta que no tenga empresa asignada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Ir al panel</Link>
          </Button>
        </CardContent>
      </>
    )
  }

  return (
    <InvitationAccept token={token} organizationName={invitation.organizationName} role={role} />
  )
}