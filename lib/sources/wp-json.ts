import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { canonicalizeUrl } from '@/lib/canonical'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import { summarize } from '@/lib/summarizer'

// WP-JSON payloads return already-clean HTML (no nav/ads/footer), so heavy
// extraction (jsdom + Readability) is unnecessary here. A regex-based strip
// is enough to feed the matcher and gives us a rough body for search/display.
// The enrich cron can later refresh full_text with real extraction from the
// canonical URL if higher fidelity is ever needed.
const BASIC_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '—', '&hellip;': '…',
}
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => BASIC_ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type WpJsonAdapter = {
  sourceId: string
  apiBase: string
}

/** Sites verified to expose a public WordPress REST API that returns posts with full content. */
export const WP_JSON_ADAPTERS: WpJsonAdapter[] = [
  { sourceId: 'fmt', apiBase: 'https://cms.freemalaysiatoday.com/wp-json/wp/v2' },
  { sourceId: 'thesun', apiBase: 'https://thesun.my/wp-json/wp/v2' },
  { sourceId: 'utusan', apiBase: 'https://www.utusan.com.my/wp-json/wp/v2' },
]

export type WpPost = {
  id: number
  link: string
  date: string
  title: { rendered: string }
  content: { rendered: string }
  excerpt?: { rendered: string }
}

export type ProcessResult = 'skipped' | 'inserted' | 'no-match'

export type ProcessOpts = {
  inlineSummary: boolean
}

const USER_AGENT = 'SkrinHitamBot/1.0 (+https://skrin-hitam.vercel.app)'

export async function getEnabledMatcherEntities(): Promise<MatcherEntity[]> {
  const rows = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  return rows.map((e) => ({ slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind }))
}

/** Single post → normalize, match, summarize, insert. Shared by backfill and wp-poll cron. */
export async function processWpJsonPost(
  adapter: WpJsonAdapter,
  post: WpPost,
  entities: MatcherEntity[],
  opts: ProcessOpts,
): Promise<ProcessResult> {
  const canonical = canonicalizeUrl(post.link)
  if (!canonical) return 'skipped'

  const existing = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(eq(schema.articles.url, canonical))
    .limit(1)
  if (existing.length) return 'skipped'

  const rawHtml = post.content?.rendered ?? ''
  const titleHtml = post.title?.rendered ?? ''
  const text = htmlToText(rawHtml)
  const title = htmlToText(titleHtml)
  if (!title || text.length < 100) return 'skipped'

  const result = matchText(`${title}\n${text}`, entities)
  if (result.scope.length === 0) return 'no-match'

  const summary = opts.inlineSummary
    ? await summarize({ title, body: text }).catch(() => null)
    : null

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

/**
 * Fetch posts from a wp-json adapter with optional "after" filter for incremental polling.
 * Returns posts in date-desc order (newest first).
 */
export async function fetchWpJsonPosts(
  adapter: WpJsonAdapter,
  opts: { search?: string; after?: Date; page?: number; perPage?: number; timeoutMs?: number },
): Promise<WpPost[]> {
  const params = new URLSearchParams({
    per_page: String(opts.perPage ?? 20),
    page: String(opts.page ?? 1),
    orderby: 'date',
    order: 'desc',
    _fields: 'id,link,date,title,content,excerpt',
  })
  if (opts.search) params.set('search', opts.search)
  if (opts.after) params.set('after', opts.after.toISOString())

  const url = `${adapter.apiBase}/posts?${params.toString()}`
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  })
  if (res.status === 400 || res.status === 404) return []  // past last page for some servers
  if (!res.ok) throw new Error(`${adapter.sourceId} wp-json HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? (data as WpPost[]) : []
}
