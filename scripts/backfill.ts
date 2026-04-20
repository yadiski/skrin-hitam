import 'dotenv/config'
import pLimit from 'p-limit'
import robotsParser from 'robots-parser'
import { db, schema } from '@/lib/db/client'
import { SOURCES } from '@/lib/sources'
import { canonicalizeUrl } from '@/lib/canonical'
import { extractArticle } from '@/lib/extractor'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import { summarize } from '@/lib/summarizer'
import { eq } from 'drizzle-orm'

const RPS_DEFAULT = 1 / 1.5
const USER_AGENT = 'MudaNewsMonitorBot/1.0 (+https://muda-news-monitor.vercel.app)'

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

async function loadRobots(baseUrl: string) {
  const txt = await fetchText(`${baseUrl.replace(/\/$/, '')}/robots.txt`)
  return robotsParser(`${baseUrl}/robots.txt`, txt ?? '')
}

async function* sitemapUrls(baseUrl: string): AsyncGenerator<string> {
  const baseOrigin = new URL(baseUrl).origin
  for (const path of ['/sitemap-news.xml', '/sitemap.xml']) {
    const xml = await fetchText(`${baseUrl.replace(/\/$/, '')}${path}`)
    if (!xml) continue
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
    for (const u of urls) {
      if (u.endsWith('.xml')) {
        try {
          if (new URL(u).origin !== baseOrigin) continue
        } catch { continue }
        const sub = await fetchText(u)
        if (sub) for (const m of sub.matchAll(/<loc>([^<]+)<\/loc>/g)) yield m[1].trim()
      } else {
        yield u
      }
    }
    return
  }
}

async function getEntities(): Promise<MatcherEntity[]> {
  const rows = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  return rows.map((e) => ({ slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind }))
}

async function processUrl(sourceId: string, url: string, entities: MatcherEntity[], withSummary: boolean): Promise<'skipped' | 'inserted' | 'no-match'> {
  const canonical = canonicalizeUrl(url)
  if (!canonical) return 'skipped'
  const existing = await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.url, canonical)).limit(1)
  if (existing.length) return 'skipped'
  const html = await fetchText(canonical)
  if (!html) return 'skipped'
  const { title, text } = extractArticle(html, canonical)
  if (!title || text.length < 100) return 'skipped'
  const result = matchText(`${title}\n${text}`, entities)
  if (result.scope.length === 0) return 'no-match'
  const summary = withSummary ? await summarize({ title, body: text }).catch(() => null) : null
  await db.insert(schema.articles).values({
    sourceId, url: canonical, title,
    publishedAt: null, snippet: text.slice(0, 500),
    fullText: text, aiSummary: summary,
    matchedEntities: [...result.scope, ...result.tag],
    matchedKeywords: result.matchedKeywords,
    enrichmentStatus: summary !== null ? 'done' : 'pending',
  })
  return 'inserted'
}

async function runForSource(sourceId: string, opts: { inlineSummary: boolean }) {
  const source = SOURCES.find((s) => s.id === sourceId)
  if (!source) throw new Error(`unknown source ${sourceId}`)
  const entities = await getEntities()
  const robots = await loadRobots(source.baseUrl)

  const start = new Date()
  let inserted = 0, skipped = 0, noMatch = 0
  const errors: unknown[] = []

  const rate = Number(process.env[`BACKFILL_RPS_${sourceId.toUpperCase()}`] ?? RPS_DEFAULT)
  const delayMs = Math.ceil(1000 / rate)
  const limit = pLimit(1)  // serial per source; rate-limit by sleep

  for await (const url of sitemapUrls(source.baseUrl)) {
    if (!robots.isAllowed(url, USER_AGENT)) { skipped++; continue }
    await new Promise((r) => setTimeout(r, delayMs))
    try {
      const r = await limit(() => processUrl(sourceId, url, entities, opts.inlineSummary))
      if (r === 'inserted') inserted++
      else if (r === 'no-match') noMatch++
      else skipped++
    } catch (e) {
      errors.push({ url, error: e instanceof Error ? e.message : String(e) })
    }
  }

  await db.insert(schema.cronRuns).values({
    kind: 'backfill', sourceId, startedAt: start, finishedAt: new Date(),
    articlesDiscovered: inserted, errors: errors as never,
    status: errors.length === 0 ? 'ok' : 'partial',
  })
  console.log(`${sourceId}: inserted=${inserted} no-match=${noMatch} skipped=${skipped} errors=${errors.length}`)
}

async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => !a.startsWith('--'))
  const inlineSummary = args.includes('--inline-summary')
  const sourceIds = sourceArg ? [sourceArg] : SOURCES.map((s) => s.id)
  for (const id of sourceIds) {
    await runForSource(id, { inlineSummary })
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
