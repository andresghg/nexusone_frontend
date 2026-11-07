'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { acceptInvitationAction } from '../action/invitation-action'

type Props = { token: string; organizationName: string; role: string }

export function InvitationAccept({ token, organizationName, role }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const accept = () =>
    startTransition(async () => {
      const { error, success, slug } = await acceptInvitationAction({ token })
      if (error) {
        toast.error(error)
        return
      }
      toast.success(success)
      router.replace(`/dashboard/${slug}`)
      router.refresh()
    })

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">Unirte a {organizationName}</CardTitle>
        <CardDescription>Te unirás con el rol de {role}.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={accept} disabled={pending}>
          Aceptar invitación
        </Button>
      </CardContent>
    </>
  )
}