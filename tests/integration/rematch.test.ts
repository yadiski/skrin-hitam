import { describe, test, expect, beforeEach } from 'vitest'
import { db, schema } from '@/lib/db/client'
import { sql, eq } from 'drizzle-orm'

const hasDb = Boolean(process.env.TEST_DATABASE_URL)
const describeIfDb = hasDb ? describe : describe.skip

describeIfDb('runRematchAllArticles', () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table cron_runs, articles, tracked_entities, sources restart identity cascade`)
    await db.insert(schema.sources).values({
      id: 'x', name: 'X', rssUrl: 'http://x', baseUrl: 'http://x', language: 'en',
    })
    await db.insert(schema.articles).values({
      sourceId: 'x',
      url: 'http://x/1',
      title: 'Parti MUDA event',
      fullText: 'Parti MUDA held a rally. YB Luqman Long spoke.',
      matchedEntities: [],
      matchedKeywords: [],
    })
  })

  test('applies new entity to existing article', async () => {
    await db.insert(schema.trackedEntities).values([
      { slug: 'muda', name: 'MUDA', keywords: ['muda','parti muda'], requireAny: [], kind: 'scope', color: '#f97316' },
      { slug: 'luqman-long', name: 'Luqman Long', keywords: ['luqman long'], requireAny: ['muda'], kind: 'tag', color: '#3b82f6' },
    ])
    const { runRematchAllArticles } = await import('@/app/api/admin/rematch/route')
    await runRematchAllArticles()

    const rows = await db.select().from(schema.articles).where(eq(schema.articles.url, 'http://x/1'))
    expect(rows[0].matchedEntities.sort()).toEqual(['luqman-long', 'muda'])
  })
})
