// features/auth/components/AuthNav.tsx
import { AppLink } from '@/lib/router-adapter'

interface AuthNavLink {
  href: string
  prompt: string
  action: string
}

export function AuthNav({ links }: { links: AuthNavLink[] }) {
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