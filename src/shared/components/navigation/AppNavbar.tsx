'use client'

import { Bell, ChevronRight, Menu, Moon, Plus, Sun } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { AppLink } from '@/lib/router-adapter'
import { findBreadcrumbs } from '@/lib/navigation-utils'
import type { NavigationGroup } from '@/types/navigation'
import { GlobalSearch } from './GlobalSearch'

interface AppNavbarProps {
  groups: NavigationGroup[]
  pathname: string
  onOpenMobile: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

/**
 * Navbar superior — deliberadamente delgado.
 *
 * Cada elemento justifica su existencia:
 * - Botón menú      → imprescindible en móvil (drawer).
 * - Breadcrumb      → orientación cuando el sidebar está colapsado u oculto.
 * - Buscador ⌘K     → acceso rápido cuando haya 15+ módulos.
 * - Nueva factura   → acción principal del POS (la más frecuente del negocio).
 * - Notificaciones  → eventos operativos (stock bajo, cobros).
 * - Tema / usuario  → utilidades de sesión.
 */
export function AppNavbar({ groups, pathname, onOpenMobile, theme, onToggleTheme }: AppNavbarProps) {
  const breadcrumbs = findBreadcrumbs(groups, pathname)

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenMobile}
        aria-label="Abrir menú"
        className="size-9 lg:hidden"
      >
        <Menu className="size-4" aria-hidden />
      </Button>

      {/* Breadcrumb derivado de la configuración */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
        <ol className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((segment, i) => (
            <li key={`${segment.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/50" aria-hidden />}
              {i === breadcrumbs.length - 1 ? (
                <span aria-current="page" className="truncate font-medium">
                  {segment.label}
                </span>
              ) : (
                <span className="truncate text-muted-foreground">{segment.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <GlobalSearch groups={groups} />

        {/* Acción principal del POS: visible, pero sin competir con la navegación */}
        <Button size="sm" asChild className="hidden h-9 gap-1.5 sm:inline-flex">
          <AppLink href="/dashboard/pos/facturacion/nueva">
            <Plus className="size-4" aria-hidden />
            Nueva factura
          </AppLink>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notificaciones" className="relative size-9">
              <Bell className="size-4" aria-hidden />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex-col items-start gap-1">
              <span className="text-sm font-medium">Stock bajo</span>
              <span className="text-xs text-muted-foreground">
                3 productos por debajo del mínimo
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-col items-start gap-1">
              <span className="text-sm font-medium">Factura por vencer</span>
              <span className="text-xs text-muted-foreground">F-0042 vence mañana</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="size-9"
        >
          {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Perfil de usuario" className="size-9">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">AG</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">Ana García</p>
              <p className="text-xs font-normal text-muted-foreground">ana@nexusone.co — Admin</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Mi perfil</DropdownMenuItem>
            <DropdownMenuItem>Preferencias</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
