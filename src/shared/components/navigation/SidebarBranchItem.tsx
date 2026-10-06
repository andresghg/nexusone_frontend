'use client'

import { ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isItemActive } from '@/lib/navigation-utils'
import { cn } from '@/lib/utils'
import type { NavBranch } from '@/types/navigation'
import { SidebarLeafLink } from './SidebarLeafLink'

interface SidebarBranchItemProps {
  item: NavBranch
  pathname: string
  collapsed: boolean
  open: boolean
  onToggle: (id: string) => void
}

/**
 * Rama expandible del sidebar (semántica <button>, nunca un <a> falso).
 *
 * - aria-expanded comunica el estado a tecnologías de asistencia.
 * - Si la rama contiene la ruta activa, se auto-expande (el usuario
 *   siempre ve dónde está) y su icono hereda el énfasis.
 * - En modo colapsado, los hijos se muestran en un flyout (popover):
 *   la funcionalidad no desaparece, cambia de presentación.
 */
export function SidebarBranchItem({ item, pathname, collapsed, open, onToggle }: SidebarBranchItemProps) {
  const active = isItemActive(item, pathname)
  const Icon = item.icon

  if (collapsed) {
    return (
      <Popover>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={item.label}
                className={cn(
                  'flex h-9 w-full items-center justify-center rounded-md outline-none transition-colors duration-150',
                  'focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.label}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" sideOffset={12} className="w-52 p-1.5">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{item.label}</p>
          <ul className="space-y-0.5">
            {item.children.map((child) => (
              <li key={child.id}>
                <SidebarLeafLink item={child} pathname={pathname} collapsed={false} />
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`nav-branch-${item.id}`}
        onClick={() => onToggle(item.id)}
        className={cn(
          'flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm outline-none transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'font-medium text-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform duration-150', open && 'rotate-90')}
          aria-hidden
        />
      </button>

      {/* Expansión: transición de altura vía grid-rows (sin JS de medición) */}
      <div
        id={`nav-branch-${item.id}`}
        className={cn(
          'grid transition-[grid-template-rows] duration-150 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <ul className="ml-[18px] space-y-0.5 border-l border-border py-1 pl-2">
            {item.children.map((child) => (
              <li key={child.id}>
                <SidebarLeafLink item={child} pathname={pathname} collapsed={false} nested />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
