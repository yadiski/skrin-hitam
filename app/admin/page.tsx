import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function AdminHome() {
  const articlesResult = await db.execute<{ count: number }>(sql`select count(*)::int as count from articles`)
  const pendingResult = await db.execute<{ count: number }>(sql`select count(*)::int as count from articles where enrichment_status = 'pending'`)
  const failedResult = await db.execute<{ count: number }>(sql`select count(*)::int as count from articles where enrichment_status = 'failed'`)
  const articles = articlesResult.rows[0].count
  const pending = pendingResult.rows[0].count
  const failed = failedResult.rows[0].count
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Articles" value={articles} />
        <Stat label="Pending enrichment" value={pending} />
        <Stat label="Failed enrichment" value={failed} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-neutral-800 rounded-lg p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
    </div>
  )
}
