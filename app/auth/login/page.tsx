import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { Metadata } from 'next'
import { generatePageTitle } from "@/shared/utils/metadata";

export const metadata: Metadata = {
  title: generatePageTitle("Iniciar Sesión"),
}

export default function Page() {


  return (
    <>
      <CardHeader>
          <CardTitle className="text-xl">Iniciar sesión</CardTitle>
          <CardDescription>Ingresá con tu cuenta para acceder al panel.</CardDescription>
      </CardHeader>
      
      <CardContent>
        <LoginForm />  
      </CardContent>
    </>
  )
}
