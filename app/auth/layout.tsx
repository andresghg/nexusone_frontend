import { Zap } from 'lucide-react'
import { Card } from '@/shared/components/ui/card'
import { AppLink } from '@/lib/router-adapter'

/**
 * Login — fuera del shell del dashboard (sin sidebar/navbar), pero con la
 * misma identidad visual: la marca replica exactamente la del header del
 * sidebar (AppSidebar.tsx) para que el usuario reconozca el producto antes
 * de entrar. Misma paleta, mismo radius, sin gradientes ni sombras elevadas
 * — reglas ya definidas en "Arquitectura de Navegación — NEXUS ONE".
 */
export default function LoginPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground">
          <Zap className="size-5 text-background" aria-hidden />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold tracking-tight">NEXUS ONE</p>
          <p className="text-[11px] text-muted-foreground">Punto de venta</p>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        {children}
      </Card>

      <nav className="mt-6 text-center flex flex-col gap-2">
        <AppLink href="#" className="text-xs text-muted-foreground">
          ¿No tenés cuenta?{' '}<span className="font-medium text-foreground">Registrate.</span>
        </AppLink>
        <AppLink href="#" className="text-xs text-muted-foreground">
          ¿olvidaste tu Contraseña?{' '}<span className="font-medium text-foreground">Recuperar Contraseña</span>
        </AppLink>
      </nav>
    </div>
  )
}
