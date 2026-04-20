import 'dotenv/config'
import Parser from 'rss-parser'
import { db, schema } from '@/lib/db/client'
import { inferSourceIdFromUrl } from '@/lib/sources'
import { canonicalizeUrl } from '@/lib/canonical'
import { extractArticle } from '@/lib/extractor'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import { summarize } from '@/lib/summarizer'
import { eq } from 'drizzle-orm'

const USER_AGENT = 'MudaNewsMonitorBot/1.0 (+https://muda-news-monitor.vercel.app)'
const DELAY_MS = 1500  // polite gap between article fetches
const rssParser = new Parser({ timeout: 15_000 })

async function getEntities(): Promise<MatcherEntity[]> {
  const rows = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  return rows.map((e) => ({ slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind }))
}

function buildGoogleNewsUrl(keywords: string[], language: 'en' | 'ms' = 'en'): string {
  const quoted = keywords.map((k) => `"${k}"`).join(' OR ')
  const params = new URLSearchParams({
    q: quoted,
    hl: language === 'ms' ? 'ms-MY' : 'en-MY',
    gl: 'MY',
    ceid: language === 'ms' ? 'MY:ms' : 'MY:en',
  })
  return `https://news.google.com/rss/search?${params.toString()}`
}

async function resolveFinalUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    return res.url || url
  } catch {
    return null
  }
}

async function fetchArticleHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

type ProcessResult = 'skipped' | 'inserted' | 'no-match'

async function processUrl(
  rawUrl: string,
  title: string,
  entities: MatcherEntity[],
  withSummary: boolean,
  publishedAt: Date | null,
): Promise<ProcessResult> {
  const canonical = canonicalizeUrl(rawUrl)
  if (!canonical) return 'skipped'

  const existing = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(eq(schema.articles.url, canonical))
    .limit(1)
  if (existing.length) return 'skipped'

  const html = await fetchArticleHtml(canonical)
  if (!html) return 'skipped'

  const extracted = extractArticle(html, canonical)
  const text = extracted.text
  const extractedTitle = extracted.title || title
  if (!extractedTitle || text.length < 100) return 'skipped'

  const result = matchText(`${extractedTitle}\n${text}`, entities)
  if (result.scope.length === 0) return 'no-match'

  const summary = withSummary ? await summarize({ title: extractedTitle, body: text }).catch(() => null) : null
  const sourceId = inferSourceIdFromUrl(canonical)

  await db.insert(schema.articles).values({
    sourceId,
    url: canonical,
    title: extractedTitle,
    publishedAt,
    snippet: text.slice(0, 500),
    fullText: text,
    aiSummary: summary,
    matchedEntities: [...result.scope, ...result.tag],
    matchedKeywords: result.matchedKeywords,
    enrichmentStatus: summary !== null ? 'done' : 'pending',
  }).onConflictDoNothing({ target: schema.articles.url })
  return 'inserted'
}

async function runForEntity(entity: { slug: string; name: string; keywords: string[] }, opts: { inlineSummary: boolean }) {
  const entitiesAll = await getEntities()
  const start = new Date()
  let inserted = 0, skipped = 0, noMatch = 0
  const errors: Array<{ url: string; error: string }> = []

  const languages: Array<'en' | 'ms'> = ['en', 'ms']
  for (const lang of languages) {
    const feedUrl = buildGoogleNewsUrl(entity.keywords, lang)
    let items: Parser.Output<unknown>
    try {
      const res = await fetch(feedUrl, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
      if (!res.ok) { errors.push({ url: feedUrl, error: `feed HTTP ${res.status}` }); continue }
      const xml = await res.text()
      items = await rssParser.parseString(xml)
    } catch (e) {
      errors.push({ url: feedUrl, error: `feed: ${e instanceof Error ? e.message : String(e)}` })
      continue
    }

    console.log(`  [${entity.slug}/${lang}] ${items.items?.length ?? 0} hits from Google News`)

    for (const item of items.items ?? []) {
      const link = item.link?.trim()
      if (!link) continue
      const title = (item.title ?? '').trim()
      const publishedAt = item.isoDate ? new Date(item.isoDate) : (item.pubDate ? new Date(item.pubDate) : null)

      await new Promise((r) => setTimeout(r, DELAY_MS))
      try {
        const finalUrl = await resolveFinalUrl(link)
        if (!finalUrl) { skipped++; continue }
        const r = await processUrl(finalUrl, title, entitiesAll, opts.inlineSummary, publishedAt)
        if (r === 'inserted') { inserted++; process.stdout.write('+') }
        else if (r === 'no-match') { noMatch++; process.stdout.write('.') }
        else { skipped++; process.stdout.write('s') }
      } catch (e) {
        errors.push({ url: link, error: e instanceof Error ? e.message : String(e) })
        process.stdout.write('E')
      }
    }
    process.stdout.write('\n')
  }

  await db.insert(schema.cronRuns).values({
    kind: 'backfill',
    sourceId: null,
    startedAt: start,
    finishedAt: new Date(),
    articlesDiscovered: inserted,
    errors: errors as never,
    status: errors.length === 0 ? 'ok' : 'partial',
  })
  console.log(`${entity.slug}: inserted=${inserted} no-match=${noMatch} skipped=${skipped} errors=${errors.length}`)
}

async function main() {
  const args = process.argv.slice(2)
  const inlineSummary = args.includes('--inline-summary')
  const slugArg = args.find((a) => !a.startsWith('--'))

  const entitiesRaw = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  const entities = slugArg
    ? entitiesRaw.filter((e) => e.slug === slugArg)
    : entitiesRaw
  if (entities.length === 0) {
    console.error(slugArg ? `entity "${slugArg}" not found or disabled` : 'no enabled tracked entities')
    process.exit(1)
  }

  console.log(`Backfilling ${entities.length} entities via Google News (${inlineSummary ? 'with' : 'without'} inline summaries)`)
  for (const e of entities) {
    await runForEntity(e, { inlineSummary })
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
