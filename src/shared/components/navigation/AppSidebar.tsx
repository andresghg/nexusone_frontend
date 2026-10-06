'use client'

import { PanelLeftClose, PanelLeftOpen, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { isBranch, type NavigationGroup } from '@/types/navigation'
import { SidebarBranchItem } from './SidebarBranchItem'
import { SidebarLeafLink } from './SidebarLeafLink'

interface AppSidebarProps {
  groups: NavigationGroup[]
  pathname: string
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
  isGroupOpen: (id: string) => boolean
  onToggleGroup: (id: string) => void
}

/**
 * Sidebar principal — UN SOLO componente renderiza toda la navegación.
 * No existen <SidebarPOS /> ni <SidebarInventario />: la config decide.
 *
 * Tres modos, misma fuente de verdad:
 * - Desktop expandido (w-64)
 * - Desktop colapsado (w-16, iconos + tooltips + flyouts)
 * - Móvil (drawer off-canvas con overlay)
 */
export function AppSidebar(props: AppSidebarProps) {
  const { collapsed, onToggleCollapsed, mobileOpen, onCloseMobile } = props
  

  
  return (
    <>
      {/* Overlay móvil */}
      {mobileOpen && (
        <div
          aria-hidden
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        aria-label="Navegación principal"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-200 ease-out',
          collapsed ? 'lg:w-16' : 'lg:w-64',
          'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Marca */}
        <div
          className={cn(
            'flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4',
            collapsed && 'lg:justify-center lg:px-0',
          )}
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground">
            <Zap className="size-4 text-background" aria-hidden />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 lg:block">
              <p className="truncate text-sm font-semibold tracking-tight">NEXUS ONE</p>
              <p className="truncate text-[11px] text-muted-foreground">Punto de venta</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="ml-auto size-8 lg:hidden"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        {/* Navegación */}
        <ScrollArea className="flex-1">
          <nav className={cn('space-y-6 px-3 py-4', collapsed && 'lg:px-2')}>
            {props.groups.map((group) => (
              <div key={group.id}>
                {!collapsed && (
                  <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </p>
                )}
                {collapsed && <div className="mx-auto mb-1.5 hidden h-px w-6 bg-border lg:block" />}
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      {isBranch(item) ? (
                        <SidebarBranchItem
                          item={item}
                          pathname={props.pathname}
                          collapsed={collapsed}
                          open={props.isGroupOpen(item.id)}
                          onToggle={props.onToggleGroup}
                        />
                      ) : (
                        <SidebarLeafLink
                          item={item}
                          pathname={props.pathname}
                          collapsed={collapsed}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Toggle de colapso (solo desktop) */}
        <div className={cn('hidden shrink-0 border-t border-border p-3 lg:block', collapsed && 'px-2')}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={collapsed ? 'icon' : 'sm'}
                onClick={onToggleCollapsed}
                aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
                className={cn(!collapsed && 'w-full justify-start gap-3 text-muted-foreground')}
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-4" aria-hidden />
                ) : (
                  <>
                    <PanelLeftClose className="size-4" aria-hidden />
                    <span>Contraer</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Expandir menú
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </>
  )
}
