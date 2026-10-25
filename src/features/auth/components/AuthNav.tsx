'use client'

import { AppLink, usePathname } from '@/lib/router-adapter'
import { authNavLinks } from '@/config/authNavLinks'

export function AuthNav() {
  const pathname = usePathname()
  const links = authNavLinks[pathname] ?? []

  if (links.length === 0) return null

  return (
    <nav className="mt-6 flex flex-col items-center gap-2 text-center">
      {links.map((link) => (
        <AppLink key={link.href} href={link.href} className="text-xs text-muted-foreground">
          {link.prompt}{' '}
          <span className="font-medium text-foreground">{link.action}</span>
        </AppLink>
      ))}
    </nav>
  )
}