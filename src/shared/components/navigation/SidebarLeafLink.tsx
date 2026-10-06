'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AppLink } from '@/lib/router-adapter'
import { isLeafActive } from '@/lib/navigation-utils'
import { cn } from '@/lib/utils'
import type { NavLeaf } from '@/types/navigation'

interface SidebarLeafLinkProps {
  item: NavLeaf
  pathname: string
  collapsed: boolean
  nested?: boolean
}

/**
 * Ítem hoja del sidebar (un enlace real, semántica <a>).
 *
 * Estado activo = fondo sutil + indicador lateral + peso tipográfico.
 * Tres señales redundantes pero discretas: visible sin ser agresivo,
 * y accesible por más de un canal (color, forma, texto).
 *
 * `aria-current="page"` comunica la página actual a lectores de pantalla.
 */
export function SidebarLeafLink({ item, pathname, collapsed, nested = false }: SidebarLeafLinkProps) {
  const active = isLeafActive(item, pathname)
  const soon = item.status === 'soon'
  const Icon = item.icon

  const link = (
    <AppLink
      href={soon ? '#' : item.href}
      aria-current={active ? 'page' : undefined}
      aria-disabled={soon || undefined}
      onClick={soon ? (e) => e.preventDefault() : undefined}
      className={cn(
        'group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm outline-none transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        soon && 'cursor-default opacity-60 hover:bg-transparent hover:text-muted-foreground',
        collapsed && 'justify-center px-0',
        nested && 'h-8 text-[13px]',
      )}
    >
      {/* Indicador lateral del estado activo */}
      {active && !collapsed && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-foreground"
        />
      )}
      <Icon className={cn('size-4 shrink-0', active && 'text-foreground')} aria-hidden />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <Badge
              variant={soon ? 'outline' : (item.badge.variant ?? 'secondary')}
              className="h-5 px-1.5 text-[10px] font-medium"
            >
              {item.badge.label}
            </Badge>
          )}
        </>
      )}
    </AppLink>
  )

  // En modo colapsado el label vive en un tooltip: el icono nunca queda huérfano.
  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return link
}
