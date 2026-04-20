import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import { canonicalizeUrl } from '@/lib/canonical'
import { extractArticle } from '@/lib/extractor'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import { summarize } from '@/lib/summarizer'
import { eq } from 'drizzle-orm'

const USER_AGENT = 'MudaNewsMonitorBot/1.0 (+https://skrin-hitam.vercel.app)'
const DELAY_MS = 600  // polite pause between REST API calls

type WpPost = {
  id: number
  link: string
  date: string
  title: { rendered: string }
  content: { rendered: string }
  excerpt?: { rendered: string }
}

type SearchAdapter = {
  sourceId: string
  name: string
  apiBase: string          // e.g. 'https://cms.freemalaysiatoday.com/wp-json/wp/v2'
}

// Sites verified to expose a usable public WP REST API.
const ADAPTERS: SearchAdapter[] = [
  { sourceId: 'fmt', name: 'Free Malaysia Today', apiBase: 'https://cms.freemalaysiatoday.com/wp-json/wp/v2' },
  { sourceId: 'thesun', name: 'The Sun', apiBase: 'https://thesun.my/wp-json/wp/v2' },
  { sourceId: 'utusan', name: 'Utusan Malaysia', apiBase: 'https://www.utusan.com.my/wp-json/wp/v2' },
]

async function searchPage(adapter: SearchAdapter, query: string, page: number): Promise<WpPost[]> {
  const url = `${adapter.apiBase}/posts?search=${encodeURIComponent(query)}&per_page=50&page=${page}&_fields=id,link,date,title,content,excerpt`
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
  if (res.status === 400 || res.status === 404) return []  // past last page
  if (!res.ok) throw new Error(`${adapter.sourceId} HTTP ${res.status}`)
  const data = await res.json() as WpPost[] | { data?: unknown }
  if (!Array.isArray(data)) return []
  return data
}

async function getEntities(): Promise<MatcherEntity[]> {
  const rows = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  return rows.map((e) => ({ slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind }))
}

type ProcessResult = 'skipped' | 'inserted' | 'no-match'

async function processPost(
  adapter: SearchAdapter,
  post: WpPost,
  entities: MatcherEntity[],
  withSummary: boolean,
): Promise<ProcessResult> {
  const canonical = canonicalizeUrl(post.link)
  if (!canonical) return 'skipped'

  const existing = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(eq(schema.articles.url, canonical))
    .limit(1)
  if (existing.length) return 'skipped'

  // The wp-json endpoint already gives us the full HTML — extract text from it directly.
  const rawHtml = post.content?.rendered ?? ''
  const extracted = extractArticle(`<html><body><article><h1>${post.title.rendered}</h1>${rawHtml}</article></body></html>`, canonical)
  const text = extracted.text || rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const title = post.title.rendered.replace(/<[^>]+>/g, '').trim()
  if (!title || text.length < 100) return 'skipped'

  const result = matchText(`${title}\n${text}`, entities)
  if (result.scope.length === 0) return 'no-match'

  const summary = withSummary ? await summarize({ title, body: text }).catch(() => null) : null

  await db.insert(schema.articles).values({
    sourceId: adapter.sourceId,
    url: canonical,
    title,
    publishedAt: post.date ? new Date(post.date) : null,
    snippet: text.slice(0, 500),
    fullText: text,
    aiSummary: summary,
    matchedEntities: [...result.scope, ...result.tag],
    matchedKeywords: result.matchedKeywords,
    enrichmentStatus: summary !== null ? 'done' : 'pending',
  }).onConflictDoNothing({ target: schema.articles.url })

  return 'inserted'
}

async function runForAdapter(
  adapter: SearchAdapter,
  query: string,
  entities: MatcherEntity[],
  opts: { inlineSummary: boolean; maxPages: number },
) {
  const start = new Date()
  let inserted = 0, skipped = 0, noMatch = 0
  const errors: Array<{ url: string; error: string }> = []

  for (let page = 1; page <= opts.maxPages; page++) {
    let posts: WpPost[]
    try {
      posts = await searchPage(adapter, query, page)
    } catch (e) {
      errors.push({ url: `${adapter.sourceId} page ${page}`, error: e instanceof Error ? e.message : String(e) })
      break
    }
    if (posts.length === 0) break

    console.log(`  [${adapter.sourceId}] query="${query}" page=${page} got ${posts.length}`)

    for (const post of posts) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
      try {
        const r = await processPost(adapter, post, entities, opts.inlineSummary)
        if (r === 'inserted') { inserted++; process.stdout.write('+') }
        else if (r === 'no-match') { noMatch++; process.stdout.write('.') }
        else { skipped++; process.stdout.write('s') }
      } catch (e) {
        errors.push({ url: post.link, error: e instanceof Error ? e.message : String(e) })
        process.stdout.write('E')
      }
    }
    process.stdout.write('\n')

    if (posts.length < 50) break  // last page
  }

  await db.insert(schema.cronRuns).values({
    kind: 'backfill',
    sourceId: adapter.sourceId,
    startedAt: start,
    finishedAt: new Date(),
    articlesDiscovered: inserted,
    errors: errors as never,
    status: errors.length === 0 ? 'ok' : 'partial',
  })
  console.log(`${adapter.sourceId}: inserted=${inserted} no-match=${noMatch} skipped=${skipped} errors=${errors.length}`)
}

async function main() {
  const args = process.argv.slice(2)
  const inlineSummary = args.includes('--inline-summary')
  const maxPagesArg = args.find((a) => a.startsWith('--max-pages='))
  const maxPages = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : 10
  const sourceArg = args.find((a) => !a.startsWith('--'))

  const entities = await getEntities()
  if (entities.length === 0) {
    console.error('no enabled tracked entities')
    process.exit(1)
  }

  const adapters = sourceArg ? ADAPTERS.filter((a) => a.sourceId === sourceArg) : ADAPTERS
  if (adapters.length === 0) {
    console.error(`no adapter for source ${sourceArg}. Available: ${ADAPTERS.map((a) => a.sourceId).join(', ')}`)
    process.exit(1)
  }

  // Build a distinct set of search queries from scope+tag entity keywords.
  const queries = Array.from(new Set(
    entities.flatMap((e) => e.keywords).map((k) => k.trim()).filter((k) => k.length >= 3),
  ))

  console.log(`Backfilling ${adapters.length} site(s) × ${queries.length} queries, up to ${maxPages} pages each (${inlineSummary ? 'with' : 'without'} inline summaries)`)
  for (const adapter of adapters) {
    for (const query of queries) {
      await runForAdapter(adapter, query, entities, { inlineSummary, maxPages })
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
