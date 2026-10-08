
import { Form, FormInput, FormLabel, FormSubmit } from "@/shared/components/forms"
import { AppLink } from '@/lib/router-adapter'

export function RegisterForm() {
  return (
    <Form>
        <div className="space-y-2">
            <FormLabel htmlFor="name">Nombre</FormLabel>
            <FormInput type="text" id="name" autoComplete="name" placeholder="Tu nombre" />
        </div>

        <div className="space-y-2">
            <FormLabel htmlFor="lastName">Apellido</FormLabel>
            <FormInput type="text" id="lastName" autoComplete="lastName" placeholder="Tu apellido" />
        </div>

        <div className="space-y-2">
            <FormLabel htmlFor="email">Correo electrónico</FormLabel>
            <FormInput type="email" id="email" autoComplete="email" placeholder="tu@email.com" />
        </div>

        <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel htmlFor="password">Contraseña</FormLabel>
                  
                </div>
                <div className="relative">
                  <FormInput  id="password" type="password" autoComplete="current-password" placeholder="••••••••" className="pr-10" />
                
                </div>
        </div>

        <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel htmlFor="repeatPassword">Repetir contraseña</FormLabel>
                  
                </div>
                <div className="relative">
                  <FormInput  id="repeatPassword" type="password" autoComplete="current-password" placeholder="••••••••" className="pr-10" />
                
                </div>
        </div>

        <FormSubmit value="Registrarse" />
    </Form>
  )
}