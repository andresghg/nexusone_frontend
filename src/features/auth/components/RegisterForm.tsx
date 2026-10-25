'use client'

import { Form, FormInput, FormLabel, FormSubmit } from "@/shared/components/forms"
import { useState } from "react"
import { Eye, EyeOff } from 'lucide-react'

export function RegisterForm() {

  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <Form>
        <div className="space-y-2">
            <FormLabel htmlFor="name">Nombre</FormLabel>
            <FormInput type="text" id="name" autoComplete="name" placeholder="Tu nombre" />
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
                  <FormInput  id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="pr-10" />

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={loading}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </button>
                
                </div>
        </div>

        <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel htmlFor="repeatPassword">Repetir contraseña</FormLabel>
                  
                </div>
                <div className="relative">
                  <FormInput  id="repeatPassword" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="pr-10" />
                
                  <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={loading}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                    </button>
                </div>
        </div>

        <FormSubmit value="Registrarse" />
    </Form>
  )
}