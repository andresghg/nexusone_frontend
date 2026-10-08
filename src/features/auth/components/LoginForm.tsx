'use client'

import { useState, type SyntheticEvent } from 'react'
import { zodResolver } from "@hookform/resolvers/zod"
import { Form, FormLabel , FormInput, FormSubmit, FormErrors } from "@/shared/components/forms"
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { AppLink, useAppNavigate } from '@/lib/router-adapter'

/**
 * Formulario de login — mock de autenticación (sin backend real todavía),
 * mismo patrón que el resto de las páginas del prototipo (FacturacionPage,
 * InventarioPage): UI completa y funcional, lista para conectar a un
 * servicio de auth real sin cambiar de forma.
 */
export function LoginForm() {
  const navigate = useAppNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
  e.preventDefault()
  setError(null)

  const form = new FormData(e.currentTarget)
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')

  if (!email || !password) {
    setError('Completá tu correo y contraseña para continuar.')
    return
  }

  setLoading(true)

  window.setTimeout(() => {
    setLoading(false)
    navigate('/')
  }, 900)
}

  return (
    <Form onSubmit={handleSubmit} noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="space-y-2">
        <FormLabel htmlFor="email">Correo electrónico</FormLabel>
        <FormInput type="email" id="email" autoComplete="email" disabled={loading} placeholder="nombre@empresa.com" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <FormLabel htmlFor="password">Contraseña</FormLabel>
          <AppLink
            href="/recuperar-contrasena"
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </AppLink>
        </div>
        <div className="relative">
          <FormInput  id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" disabled={loading} placeholder="••••••••" className="pr-10" />
          
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

      <div className="flex items-center gap-2">
        <Checkbox id="remember" name="remember" disabled={loading} />
        <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
          Mantener sesión iniciada
        </Label>
      </div>

      <FormSubmit disabled={loading} value="Iniciar sesión" />
    </Form>
  )
}
