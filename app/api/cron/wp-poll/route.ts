import { NextResponse } from 'next/server'
import pLimit from 'p-limit'
import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'
import {
  WP_JSON_ADAPTERS,
  fetchWpJsonPosts,
  getEnabledMatcherEntities,
  processWpJsonPost,
} from '@/lib/sources/wp-json'
import { recordCronRun } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const maxDuration = 60

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runWpPoll()
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runWpPoll()
}

const LOOKBACK_MS = 24 * 60 * 60 * 1000  // if no prior articles, fetch from last 24h

async function runWpPoll() {
  const entities = await getEnabledMatcherEntities()
  if (entities.length === 0) return NextResponse.json({ ok: true, sources: [], note: 'no enabled entities' })

  const limit = pLimit(3)
  const results = await Promise.all(WP_JSON_ADAPTERS.map((adapter) => limit(async () => {
    try {
      // Anchor: max published_at we have for this source; fall back to 24h ago.
      const anchorRow = await db.execute<{ max_pub: string | null }>(sql`
        select max(published_at)::text as max_pub
        from articles where source_id = ${adapter.sourceId}
      `)
      const maxPubStr = anchorRow.rows[0]?.max_pub
      const after = maxPubStr ? new Date(maxPubStr) : new Date(Date.now() - LOOKBACK_MS)

      const posts = await fetchWpJsonPosts(adapter, { after, perPage: 20 })

      let inserted = 0
      const errors: Array<{ url: string; error: string }> = []
      for (const post of posts) {
        try {
          const r = await processWpJsonPost(adapter, post, entities, { inlineSummary: false })
          if (r === 'inserted') inserted++
        } catch (e) {
          errors.push({ url: post.link, error: e instanceof Error ? e.message : String(e) })
        }
      }

      await recordCronRun({
        kind: 'poll',
        sourceId: adapter.sourceId,
        articlesDiscovered: inserted,
        errors,
        status: errors.length === 0 ? 'ok' : (inserted > 0 ? 'partial' : 'failed'),
      })
      return { sourceId: adapter.sourceId, inserted, checked: posts.length }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await recordCronRun({
        kind: 'poll',
        sourceId: adapter.sourceId,
        status: 'failed',
        errors: [{ stage: 'wp-json', error: msg }],
      }).catch(() => {})
      return { sourceId: adapter.sourceId, inserted: 0, error: msg }
    }
  })))

  return NextResponse.json({ ok: true, sources: results })
}
