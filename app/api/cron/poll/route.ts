import { NextResponse } from 'next/server'
import pLimit from 'p-limit'
import { SOURCES } from '@/lib/sources'
import { fetchFeed } from '@/lib/rss'
import { canonicalizeUrl } from '@/lib/canonical'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import {
  getEnabledSources, getEnabledEntities,
  findExistingUrls, insertArticles, recordCronRun,
  type NewArticleInput,
} from '@/lib/db/queries'
import { maybeAlertStaleSources } from '@/lib/alert'

export const runtime = 'nodejs'
export const maxDuration = 60

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runPoll()
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runPoll()
}

async function runPoll() {
  const [sourcesDb, entitiesDb] = await Promise.all([getEnabledSources(), getEnabledEntities()])
  const matcherEntities: MatcherEntity[] = entitiesDb.map((e) => ({
    slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind,
  }))

  const limit = pLimit(4)
  const results = await Promise.all(sourcesDb.map((s) => limit(async () => {
    try {
      const def = SOURCES.find((d) => d.id === s.id)
      const rssUrl = def?.rssUrl ?? s.rssUrl
      const feed = await fetchFeed(rssUrl)
      if (feed.status !== 'ok') {
        await recordCronRun({ kind: 'poll', sourceId: s.id, status: 'failed', errors: [{ stage: 'fetch', error: feed.status === 'error' ? feed.error : 'not_modified' }] })
        return { sourceId: s.id, inserted: 0 }
      }

      const candidates: NewArticleInput[] = []
      for (const item of feed.items) {
        const url = canonicalizeUrl(item.url)
        if (!url) continue
        const result = matchText(`${item.title}\n${item.snippet}`, matcherEntities)
        if (result.scope.length === 0) continue
        candidates.push({
          sourceId: s.id, url, title: item.title,
          publishedAt: item.publishedAt, snippet: item.snippet,
          matchedEntities: [...result.scope, ...result.tag],
          matchedKeywords: result.matchedKeywords,
        })
      }

      const existing = await findExistingUrls(candidates.map((c) => c.url))
      const fresh = candidates.filter((c) => !existing.has(c.url))
      const inserted = await insertArticles(fresh)
      await recordCronRun({ kind: 'poll', sourceId: s.id, status: 'ok', articlesDiscovered: inserted })
      return { sourceId: s.id, inserted }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await recordCronRun({ kind: 'poll', sourceId: s.id, status: 'failed', errors: [{ stage: 'db', error: msg }] }).catch(() => {})
      return { sourceId: s.id, inserted: 0 }
    }
  })))

  await maybeAlertStaleSources()
  return NextResponse.json({ ok: true, sources: results })
}
