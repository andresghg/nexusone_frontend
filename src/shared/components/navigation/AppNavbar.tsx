'use client'

import { ChevronRight, Menu, Moon, Plus, Sun } from 'lucide-react'
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
import { signOutAction } from '@/features/auth/actions/auth-action'
import { findBreadcrumbs } from '@/lib/navigation-utils'
import type { NavigationGroup } from '@/types/navigation'
import { GlobalSearch } from './GlobalSearch'
import { NotificationsMenu } from '@/features/notifications/components/NotificationsMenu'
import type { AppNotification } from '@/features/notifications/types/notification'
import type { CurrentUser } from '@/shared/types/CurrentUser'

interface AppNavbarProps {
  groups: NavigationGroup[]
  basePath: string
  onOpenMobile: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  currentUser: CurrentUser
  notifications: AppNotification[]
}

/**
 * Navbar superior — deliberadamente delgado.
*
 * Cada elemento justifica su existencia:
 * - Botón menú      → imprescindible en móvil (drawer).
 * - Breadcrumb      → orientación cuando el sidebar está colapsado u oculto.
 * - Buscador ⌘K     → acceso rápido cuando haya 15+ módulos.
 * - Nueva factura   → acción principal del POS (la más frecuente del negocio).
 * - Notificaciones  → avisos reales derivados del negocio (facturas vencidas o por vencer, stock bajo).
 * - Tema / usuario  → utilidades de sesión.
 */
export function AppNavbar({ groups, basePath, onOpenMobile, theme, onToggleTheme, currentUser, notifications }: AppNavbarProps) {
  const breadcrumbs = findBreadcrumbs(groups, basePath)

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
          <AppLink href={`${basePath}/pos/facturacion/nueva`}>
            <Plus className="size-4" aria-hidden />
            Nueva factura
          </AppLink>
        </Button>

        <NotificationsMenu notifications={notifications} />

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
                <AvatarFallback className="text-xs">{currentUser.name?.charAt(0)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">{currentUser.name}</p>
              <p className="text-xs font-normal text-muted-foreground">{currentUser.email} — {currentUser.roleLabel}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Mi perfil</DropdownMenuItem>
            <DropdownMenuItem>Preferencias</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOutAction()}>Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
