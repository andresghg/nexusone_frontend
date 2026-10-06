// features/auth/components/AuthNav.tsx
import Link from 'next/link'

interface AuthNavLink {
  href: string
  prompt: string
  action: string
}

export function AuthNav({ links }: { links: AuthNavLink[] }) {
  return (
    <nav className="mt-6 flex flex-col items-center gap-2 text-center">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="text-xs text-muted-foreground">
          {link.prompt}{' '}
          <span className="font-medium text-foreground">{link.action}</span>
        </Link>
      ))}
    </nav>
  )
}