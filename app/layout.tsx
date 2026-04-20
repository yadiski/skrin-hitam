import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MUDA News Monitor',
  description: 'Tracking Parti MUDA news coverage across Malaysian media.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 antialiased font-mono">
        {children}
      </body>
    </html>
  )
}
