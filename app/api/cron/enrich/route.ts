import { NextResponse } from 'next/server'
import pLimit from 'p-limit'
import { extractArticle } from '@/lib/extractor'
import { summarize } from '@/lib/summarizer'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import {
  getPendingArticles, getEnabledEntities,
  updateArticleEnriched, bumpArticleFailure, recordCronRun,
} from '@/lib/db/queries'

export const runtime = 'nodejs'
export const maxDuration = 800

const USER_AGENT = 'SkrinHitamBot/1.0 (+https://skrin-hitam.vercel.app)'

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runEnrich()
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runEnrich()
}

async function runEnrich() {
  const [pending, entitiesDb] = await Promise.all([getPendingArticles(20), getEnabledEntities()])
  const entities: MatcherEntity[] = entitiesDb.map((e) => ({
    slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind,
  }))

  let enriched = 0
  const errors: { id: string; error: string }[] = []
  const limit = pLimit(3)

  await Promise.all(pending.map((a) => limit(async () => {
    try {
      const res = await fetch(a.url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const { text } = extractArticle(html, a.url)
      if (!text || text.length < 200) {
        await updateArticleEnriched(a.id, {
          fullText: text, aiSummary: null,
          matchedEntities: a.matchedEntities, matchedKeywords: a.matchedKeywords,
        })
        enriched++
        return
      }
      const rematch = matchText(`${a.title}\n${text}`, entities)
      const combinedEntities = rematch.scope.length > 0 ? [...rematch.scope, ...rematch.tag] : a.matchedEntities
      const summary = await summarize({ title: a.title, body: text })
      await updateArticleEnriched(a.id, {
        fullText: text, aiSummary: summary,
        matchedEntities: combinedEntities,
        matchedKeywords: rematch.matchedKeywords.length ? rematch.matchedKeywords : a.matchedKeywords,
      })
      enriched++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push({ id: a.id, error: msg })
      await bumpArticleFailure(a.id, msg)
    }
  })))

  await recordCronRun({
    kind: 'enrich',
    articlesEnriched: enriched,
    errors,
    status: errors.length === 0 ? 'ok' : (enriched > 0 ? 'partial' : 'failed'),
  })

  return NextResponse.json({ ok: true, enriched, errors: errors.length })
}
