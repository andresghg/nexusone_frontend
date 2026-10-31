import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Metadata } from 'next'
import { generatePageTitle } from "@/shared/utils/metadata";
import { safeNext } from '@/features/auth/utils/safeNext'

export const metadata: Metadata = {
  title: generatePageTitle("Registrar Usuario"),
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams

  return (
    <>
      <CardHeader>
          <CardTitle className="text-xl">Registrar usuario</CardTitle>
          <CardDescription>Registrá un nuevo usuario.</CardDescription>
      </CardHeader>

      <CardContent>
        <RegisterForm next={safeNext(next)} />
      </CardContent>
    </>
  )
}


