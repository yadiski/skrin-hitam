import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Skrin Hitam by Payong Legam Malaysia',
  description: 'Malaysian political news monitor — coverage tracking across multiple outlets.',
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
