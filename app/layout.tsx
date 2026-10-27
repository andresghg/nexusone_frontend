import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: 'NexusOne',
  description: 'NexusOne ERP Dashboard',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        {children}
        <Toaster position="top-right"/>
      </body>
    </html>
  )
}
