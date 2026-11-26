'use client'

import { AlertTriangle, Bell, Clock, Package, type LucideIcon } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { AppNotification, NotificationKind } from '../types/notification'

// Cada tipo tiene su propio ícono: el color solo refuerza, nunca es lo único que distingue
const ICONS: Record<NotificationKind, LucideIcon> = {
  overdue: AlertTriangle,
  due_soon: Clock,
  low_stock: Package,
}

export function NotificationsMenu({ notifications }: { notifications: AppNotification[] }) {
  const count = notifications.length
  const hasCritical = notifications.some((n) => n.severity === 'critical')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={count > 0 ? `Notificaciones: ${count} ${count === 1 ? 'pendiente' : 'pendientes'}` : 'Notificaciones'}
          className="relative size-9"
        >
          <Bell className="size-4" aria-hidden />
          {count > 0 && (
            <span
              data-testid="notifications-dot"
              className={cn('absolute right-2 top-2 size-1.5 rounded-full', hasCritical ? 'bg-destructive' : 'bg-amber-500')}
              aria-hidden
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <p role="status" className="px-2 py-6 text-center text-sm text-muted-foreground">
            No tienes notificaciones pendientes
          </p>
        ) : (
          notifications.map((notification) => {
            const Icon = ICONS[notification.id]
            return (
              <DropdownMenuItem key={notification.id} asChild className="cursor-pointer items-start gap-3 py-2">
                <AppLink href={notification.href}>
                  <Icon
                    className={cn('mt-0.5 size-4 shrink-0', notification.severity === 'critical' ? 'text-destructive' : 'text-amber-600')}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{notification.title}</span>
                    <span className="text-xs text-muted-foreground">{notification.description}</span>
                  </span>
                </AppLink>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
