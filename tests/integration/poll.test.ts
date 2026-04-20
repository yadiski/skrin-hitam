import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, schema } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

const hasDb = Boolean(process.env.DATABASE_URL)
const describeIfDb = hasDb ? describe : describe.skip

const SAMPLE_RSS = readFileSync(join(__dirname, '../fixtures/rss/malaysiakini-sample.xml'), 'utf8')

describeIfDb('POST /api/cron/poll integration', () => {
  beforeAll(async () => {
    await db.execute(sql`truncate table cron_runs, articles, tracked_entities, sources restart identity cascade`)
    await db.insert(schema.sources).values({
      id: 'malaysiakini', name: 'Malaysiakini',
      rssUrl: 'https://example.test/feed.rss', baseUrl: 'https://example.test', language: 'en',
    })
    await db.insert(schema.trackedEntities).values([
      { slug: 'muda', name: 'MUDA', keywords: ['muda','parti muda'], requireAny: [], kind: 'scope', color: '#f97316' },
      { slug: 'luqman-long', name: 'Luqman Long', keywords: ['luqman long'], requireAny: ['muda','parti muda'], kind: 'tag', color: '#3b82f6' },
    ])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE_RSS, {
      status: 200, headers: { 'content-type': 'application/rss+xml' },
    })))
  })
  afterAll(() => { vi.unstubAllGlobals() })

  test('inserts matching articles, skips unrelated ones', async () => {
    const { POST } = await import('@/app/api/cron/poll/route')
    const req = new Request('http://x/api/cron/poll', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}` },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const rows = await db.select().from(schema.articles)
    expect(rows).toHaveLength(1)
    expect(rows[0].matchedEntities).toContain('muda')
    expect(rows[0].title).toContain('Parti MUDA')
  })

  test('dedupes on second run', async () => {
    const { POST } = await import('@/app/api/cron/poll/route')
    const req = new Request('http://x/api/cron/poll', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}` },
    })
    await POST(req)
    const rows = await db.select().from(schema.articles)
    expect(rows).toHaveLength(1)  // still 1
  })
})
