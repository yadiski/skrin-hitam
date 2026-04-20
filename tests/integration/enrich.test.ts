import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'

const hasDb = Boolean(process.env.TEST_DATABASE_URL)
const describeIfDb = hasDb ? describe : describe.skip

const ARTICLE_HTML = readFileSync(join(__dirname, '../fixtures/html/simple-article.html'), 'utf8')

vi.mock('@/lib/summarizer', () => ({
  summarize: vi.fn(async () => 'MUDA leader Luqman Long made a speech about youth empowerment.'),
}))

describeIfDb('POST /api/cron/enrich integration', () => {
  let articleId: string

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
    const inserted = await db.insert(schema.articles).values({
      sourceId: 'malaysiakini',
      url: 'https://example.test/article-1',
      title: 'Parti MUDA policy speech',
      snippet: 'YB Luqman Long spoke...',
      matchedEntities: ['muda'],
      matchedKeywords: ['parti muda'],
    }).returning({ id: schema.articles.id })
    articleId = inserted[0].id

    vi.stubGlobal('fetch', vi.fn(async () => new Response(ARTICLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })))
  })
  afterAll(() => { vi.unstubAllGlobals() })

  test('enriches pending article and adds tag', async () => {
    const { POST } = await import('@/app/api/cron/enrich/route')
    const req = new Request('http://x', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}` },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const row = await db.select().from(schema.articles).where(eq(schema.articles.id, articleId))
    expect(row[0].enrichmentStatus).toBe('done')
    expect(row[0].fullText).toContain('youth empowerment')
    expect(row[0].aiSummary).toContain('youth empowerment')
    expect(row[0].matchedEntities).toContain('luqman-long')
  })
})
