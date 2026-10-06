

export default function FormErrors({children}: {children: React.ReactNode}) {
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{children}</p>
  )
}
