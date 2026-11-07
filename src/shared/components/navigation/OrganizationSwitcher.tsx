'use client'

import { Check, ChevronsUpDown, Plus, Zap } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { AppLink } from '@/lib/router-adapter'
import { cn } from '@/lib/utils'

export interface OrganizationOption {
  slug: string
  name: string
  roleLabel: string
}

interface OrganizationSwitcherProps {
  organizations: OrganizationOption[]
  currentSlug: string
  canCreate: boolean
  collapsed: boolean
}

/**
 * Marca del sidebar + selector de empresa. Si el usuario tiene una sola empresa y no
 * puede crear más, queda como una marca estática (sin menú que no sirve).
 */
export function OrganizationSwitcher({
  organizations,
  currentSlug,
  canCreate,
  collapsed,
}: OrganizationSwitcherProps) {
  const current = organizations.find((o) => o.slug === currentSlug)
  const interactive = organizations.length > 1 || canCreate

  const content = (
    <>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground">
        <Zap className="size-4 text-background" aria-hidden />
      </div>
      {!collapsed && (
        <>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold tracking-tight">
              {current?.name ?? 'NEXUS ONE'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">NEXUS ONE</p>
          </div>
          {interactive && (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </>
      )}
    </>
  )

  if (!interactive) {
    return <div className="flex min-w-0 flex-1 items-center gap-2.5">{content}</div>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Cambiar de empresa"
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'lg:flex-none lg:p-1',
          )}
        >
          {content}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Tus empresas</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem key={org.slug} asChild>
            <AppLink href={`/dashboard/${org.slug}`} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{org.name}</p>
                <p className="text-xs text-muted-foreground">{org.roleLabel}</p>
              </div>
              {org.slug === currentSlug && <Check className="size-4 shrink-0" aria-hidden />}
            </AppLink>
          </DropdownMenuItem>
        ))}

        {canCreate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <AppLink href="/nueva-empresa" className="flex items-center gap-2">
                <Plus className="size-4" aria-hidden />
                Nueva empresa
              </AppLink>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}