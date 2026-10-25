'use client'

import { Form, FormInput, FormLabel, FormSubmit, FormErrors } from "@/shared/components/forms"
import { useState } from "react"
import { Eye, EyeOff } from 'lucide-react'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SignUpSchema, SignUpInput } from "../schemas/authSchema"
import { signUpAction } from "../actions/auth-action"
import toast from "react-hot-toast";

export function RegisterForm() {

  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const {register, handleSubmit, formState: {errors}} = useForm({
    resolver: zodResolver(SignUpSchema),
  })

  const onSubmit = async (data: SignUpInput) => {
    const { error, success } = await signUpAction(data)
    if(error) {
      toast.error(error)
    }
    if(success) {
      toast.success(success)
    }
  }

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
            <FormLabel htmlFor="name">Nombre</FormLabel>
            <FormInput {...register("name")} type="text" id="name" autoComplete="name" placeholder="Tu nombre" />
            {errors.name && <FormErrors>{errors.name.message}</FormErrors>}
        </div>

        <div className="space-y-2">
            <FormLabel htmlFor="email">Correo electrónico</FormLabel>
            <FormInput {...register("email")} type="email" id="email" autoComplete="email" placeholder="tu@email.com" />
            {errors.email && <FormErrors>{errors.email.message}</FormErrors>}
        </div>

        <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel htmlFor="password">Contraseña</FormLabel>
                  
                </div>
                <div className="relative">
                  <FormInput {...register("password")} id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="pr-10" />
                  {errors.password && <FormErrors>{errors.password.message}</FormErrors>}
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
                  <FormLabel htmlFor="passwordConfirmation">Repetir contraseña</FormLabel>
                  
                </div>
                <div className="relative">
                  <FormInput {...register("passwordConfirmation")} id="passwordConfirmation" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="pr-10" />
                  {errors.passwordConfirmation && <FormErrors>{errors.passwordConfirmation.message}</FormErrors>}
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