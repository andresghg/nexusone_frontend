'use client'

import { useMemo, type ReactNode } from 'react'
import { TooltipProvider } from '@/shared/components/ui/tooltip'
import { AppNavbar } from '@/shared/components/navigation/AppNavbar'
import { AppSidebar } from '@/shared/components/navigation/AppSidebar'
import { navigationConfig } from '@/config/navigation'
import { useSidebarState } from '@/hooks/use-sidebar-state'
import { useTheme } from '@/hooks/use-theme'
import { filterByPermissions, withBasePath } from '@/lib/navigation-utils'
import { cn } from '@/lib/utils'
import type { Permission } from '@/types/navigation'
import type { OrganizationOption } from '@/shared/components/navigation/OrganizationSwitcher'
import type { CurrentUser } from '@/shared/types/CurrentUser'


/**
 * ============================================================================
 * Shell interactivo del dashboard ("use client").
 * ----------------------------------------------------------------------------
 * `app/(dashboard)/layout.tsx` (Server Component) obtiene la sesión y pasa
 * `permissions` aquí (datos serializables). Este shell combina esos permisos
 * con la configuración de navegación (que incluye componentes de ícono, no
 * serializables a través del límite server/client) y maneja lo que necesita
 * el navegador: pathname, estado del sidebar y tema.
 *
 * Así el layout de la ruta NO se convierte en Client Component innecesariamente:
 * solo este shell interactivo lo es.
 * ============================================================================
 */
interface DashboardShellProps {
  slug: string
  organizations: OrganizationOption[]
  canCreateOrganization: boolean
  permissions: Permission[]
  children: ReactNode
  currentUser: CurrentUser
}

export function DashboardShell({ slug, organizations, canCreateOrganization, permissions, children, currentUser }: DashboardShellProps) {
  const basePath = `/dashboard/${slug}`
  const { theme, toggleTheme } = useTheme()

  const groups = useMemo(
    () => withBasePath(filterByPermissions(navigationConfig, permissions), basePath),
    [permissions, basePath],
  )

  const sidebar = useSidebarState(groups, basePath)

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar
          groups={groups}
          pathname={basePath}
          collapsed={sidebar.collapsed}
          onToggleCollapsed={sidebar.toggleCollapsed}
          mobileOpen={sidebar.mobileOpen}
          onCloseMobile={sidebar.closeMobile}
          isGroupOpen={sidebar.isGroupOpen}
          onToggleGroup={sidebar.toggleGroup}
          organizations={organizations}
          currentSlug={slug}
          canCreateOrganization={canCreateOrganization}
        />

        <div
          className={cn(
            'flex min-h-screen flex-col transition-[padding] duration-200 ease-out',
            sidebar.collapsed ? 'lg:pl-16' : 'lg:pl-64',
          )}
        >
          <AppNavbar
            groups={groups}
            basePath={basePath}
            onOpenMobile={sidebar.openMobile}
            theme={theme}
            onToggleTheme={toggleTheme}
            currentUser={currentUser}
          />

          <main id="main-content" className="flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
