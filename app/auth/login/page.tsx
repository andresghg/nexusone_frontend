import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { Metadata } from 'next'
import { generatePageTitle } from "@/shared/utils/metadata";
import { safeNext } from '@/features/auth/utils/safeNext'

export const metadata: Metadata = {
  title: generatePageTitle("Iniciar Sesión"),
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams

  return (
    <>
      <CardHeader>
          <CardTitle className="text-xl">Iniciar sesión</CardTitle>
          <CardDescription>Ingresá con tu cuenta para acceder al panel.</CardDescription>
      </CardHeader>
      
      <CardContent>
        <LoginForm next={safeNext(next)} />  
      </CardContent>
    </>
  )
}
