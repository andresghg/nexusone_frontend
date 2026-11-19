import type { ReactNode } from 'react'

export default function NewOrganizationLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      {children}
    </main>
  )
}