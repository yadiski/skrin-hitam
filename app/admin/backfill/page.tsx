import { db, schema } from '@/lib/db/client'
import { desc, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function BackfillPage() {
  const runs = await db.select().from(schema.cronRuns).where(eq(schema.cronRuns.kind, 'backfill')).orderBy(desc(schema.cronRuns.startedAt)).limit(50)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Backfill</h1>
      <p className="text-sm text-neutral-400">
        Backfill runs outside Vercel (800s budget isn&apos;t enough). From your local machine:
      </p>
      <pre className="bg-neutral-900 border border-neutral-800 rounded p-3 text-xs overflow-x-auto">npm run backfill -- &lt;source-id&gt; [--inline-summary]</pre>
      <h2 className="text-lg">Past backfill runs</h2>
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr><th className="text-left px-3 py-2">Source</th><th className="text-left px-3 py-2">Started</th><th className="text-left px-3 py-2">Finished</th><th className="text-left px-3 py-2">Inserted</th><th className="text-left px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 font-mono text-xs">{r.sourceId}</td>
                <td className="px-3 py-2 text-xs">{r.startedAt.toISOString()}</td>
                <td className="px-3 py-2 text-xs">{r.finishedAt?.toISOString() ?? '—'}</td>
                <td className="px-3 py-2">{r.articlesDiscovered}</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
