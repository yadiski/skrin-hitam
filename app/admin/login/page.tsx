import { loginAction } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form action={loginAction} className="w-full max-w-sm space-y-4 border border-neutral-800 rounded-lg p-6">
        <h1 className="text-lg">Admin login</h1>
        <input name="password" type="password" autoComplete="current-password" required
          className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2" placeholder="Password" />
        {error && <p className="text-sm text-red-400">Invalid password.</p>}
        <button type="submit" className="w-full bg-orange-500 text-black rounded px-3 py-2 font-semibold">Sign in</button>
      </form>
    </main>
  )
}
