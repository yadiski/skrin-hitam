import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'

const STALE_THRESHOLD_MIN = 120
const ALERT_WINDOW_HOURS = 24

export async function maybeAlertStaleSources() {
  const webhook = process.env.ALERT_WEBHOOK_URL
  if (!webhook) return

  const result = await db.execute<{ source_id: string; last_ok: string | null; last_alerted_at: string | null }>(sql`
    select s.id as source_id,
           (select max(started_at) from cron_runs c where c.source_id = s.id and c.kind = 'poll' and c.status = 'ok') as last_ok,
           s.last_alerted_at::text as last_alerted_at
    from sources s
    where s.enabled = true
  `)
  const rows = result.rows
  const now = Date.now()
  for (const r of rows) {
    const lastOk = r.last_ok ? new Date(r.last_ok).getTime() : 0
    const ageMin = lastOk ? (now - lastOk) / 60_000 : Infinity
    if (ageMin < STALE_THRESHOLD_MIN) continue
    const lastAlert = r.last_alerted_at ? new Date(r.last_alerted_at).getTime() : 0
    const alertAgeHr = (now - lastAlert) / 3_600_000
    if (alertAgeHr < ALERT_WINDOW_HOURS) continue

    await fetch(webhook, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `Source stale: ${r.source_id} (no successful poll in ${Math.floor(ageMin)}m)` }),
    }).catch(() => {})
    await db.update(schema.sources).set({ lastAlertedAt: new Date() }).where(eq(schema.sources.id, r.source_id))
  }
}
