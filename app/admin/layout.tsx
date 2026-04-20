import Link from 'next/link'
import { logoutAction } from './login/actions'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center gap-4">
        <span className="font-semibold">Admin</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin">Overview</Link>
          <Link href="/admin/entities">Entities</Link>
          <Link href="/admin/sources">Sources</Link>
          <Link href="/admin/runs">Runs</Link>
          <Link href="/admin/backfill">Backfill</Link>
        </nav>
        <form action={logoutAction} className="ml-auto">
          <button type="submit" className="text-sm text-neutral-400 hover:text-white">Log out</button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
