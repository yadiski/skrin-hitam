import { db, schema } from '@/lib/db/client'
import { asc, sql } from 'drizzle-orm'
import { updateSource } from './actions'

export const dynamic = 'force-dynamic'

export default async function SourcesPage() {
  const sources = await db.select().from(schema.sources).orderBy(asc(schema.sources.id))
  const lastRunsResult = await db.execute<{ source_id: string; started_at: string; status: string; errors_count: number }>(sql`
    select distinct on (source_id) source_id, started_at::text, status, coalesce(jsonb_array_length(errors), 0) as errors_count
    from cron_runs where kind = 'poll' and source_id is not null
    order by source_id, started_at desc
  `)
  const lastRuns = lastRunsResult.rows
  const runBySource = new Map(lastRuns.map((r) => [r.source_id, r]))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Sources</h1>
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Enabled</th>
              <th className="text-left px-3 py-2">RSS URL</th>
              <th className="text-left px-3 py-2">Last poll</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const last = runBySource.get(s.id)
              return (
                <tr key={s.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 font-mono text-xs">{s.id}</td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">
                    <form action={updateSource}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="field" value="enabled" />
                      <input name="enabled" type="checkbox" defaultChecked={s.enabled} />
                    </form>
                  </td>
                  <td className="px-3 py-2">
                    <form action={updateSource} className="contents">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="field" value="rssUrl" />
                      <input name="rssUrl" defaultValue={s.rssUrl} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full" />
                    </form>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {last ? <>{last.status} · {new Date(last.started_at).toISOString()} · {last.errors_count} errs</> : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
