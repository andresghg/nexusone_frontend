import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Metadata } from 'next'
import { generatePageTitle } from "@/shared/utils/metadata";

export const metadata: Metadata = {
  title: generatePageTitle("Registrar Usuario"),
}

export default function Page() {
  return (
    <>
      <CardHeader>
          <CardTitle className="text-xl">Registrar usuario</CardTitle>
          <CardDescription>Registrá un nuevo usuario.</CardDescription>
      </CardHeader>

      <CardContent>
        <RegisterForm />
      </CardContent>
    </>
  )
}


