import { db, schema } from '@/lib/db/client'
import { desc } from 'drizzle-orm'

export default async function RunsPage() {
  const runs = await db.select().from(schema.cronRuns).orderBy(desc(schema.cronRuns.startedAt)).limit(50)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Recent cron runs</h1>
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="text-left px-3 py-2">Started</th>
              <th className="text-left px-3 py-2">Kind</th>
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Discovered</th>
              <th className="text-left px-3 py-2">Enriched</th>
              <th className="text-left px-3 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 text-xs">{r.startedAt.toISOString()}</td>
                <td className="px-3 py-2">{r.kind}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.sourceId ?? '—'}</td>
                <td className={`px-3 py-2 ${statusColor(r.status)}`}>{r.status}</td>
                <td className="px-3 py-2">{r.articlesDiscovered}</td>
                <td className="px-3 py-2">{r.articlesEnriched}</td>
                <td className="px-3 py-2 text-xs">
                  {Array.isArray(r.errors) && (r.errors as unknown[]).length > 0
                    ? JSON.stringify(r.errors).slice(0, 200) + '…'
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function statusColor(status: string) {
  if (status === 'ok') return 'text-emerald-400'
  if (status === 'partial') return 'text-yellow-400'
  return 'text-red-400'
}
