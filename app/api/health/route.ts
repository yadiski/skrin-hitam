import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await db.execute<{ source_id: string; kind: string; started_at: string; status: string }>(sql`
    select distinct on (source_id, kind) source_id, kind, started_at::text, status
    from cron_runs where kind in ('poll','enrich')
    order by source_id, kind, started_at desc
  `)
  const rows = result.rows
  const now = Date.now()
  const perSource: Record<string, { poll?: { at: string; status: string; ageMinutes: number }; enrich?: { at: string; status: string; ageMinutes: number } }> = {}
  for (const r of rows) {
    const sid = r.source_id ?? '_global'
    const ageMinutes = Math.floor((now - new Date(r.started_at).getTime()) / 60_000)
    perSource[sid] ??= {}
    perSource[sid][r.kind as 'poll' | 'enrich'] = { at: r.started_at, status: r.status, ageMinutes }
  }
  return NextResponse.json({ ok: true, sources: perSource })
}
