export const dynamic = 'force-dynamic'
export const revalidate = 0

import { db, schema } from '@/lib/db/client'
import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { ArticleCard } from './_components/article-card'
import { FilterBar } from './_components/filter-bar'

type Search = {
  entity?: string
  source?: string
  q?: string
  kw?: string
  from?: string
  to?: string
  sort?: string
  page?: string
}

type SortMode = 'newest' | 'oldest' | 'relevance'
const VALID_SORTS: SortMode[] = ['newest', 'oldest', 'relevance']

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const pageSize = 25
  const sort: SortMode = VALID_SORTS.includes(params.sort as SortMode) ? (params.sort as SortMode) : 'newest'

  const conditions: SQL[] = [eq(schema.articles.falsePositive, false)]
  if (params.entity) conditions.push(sql`${schema.articles.matchedEntities} @> ARRAY[${params.entity}]::text[]`)
  if (params.source) conditions.push(eq(schema.articles.sourceId, params.source))
  if (params.q) conditions.push(sql`${schema.articles.searchTsv} @@ plainto_tsquery('simple', ${params.q})`)
  if (params.kw) conditions.push(sql`${schema.articles.matchedKeywords} @> ARRAY[${params.kw.toLowerCase()}]::text[]`)
  if (params.from) {
    const fromDate = new Date(params.from)
    if (!isNaN(fromDate.getTime())) conditions.push(gte(schema.articles.publishedAt, fromDate))
  }
  if (params.to) {
    const toDate = new Date(params.to)
    if (!isNaN(toDate.getTime())) {
      toDate.setUTCHours(23, 59, 59, 999)
      conditions.push(lte(schema.articles.publishedAt, toDate))
    }
  }

  const orderByClause = (() => {
    if (sort === 'oldest') return [sql`${schema.articles.publishedAt} asc nulls last`, asc(schema.articles.discoveredAt)]
    if (sort === 'relevance') return [sql`coalesce(array_length(${schema.articles.matchedKeywords}, 1), 0) desc`, desc(schema.articles.publishedAt)]
    return [sql`${schema.articles.publishedAt} desc nulls last`, desc(schema.articles.discoveredAt)]
  })()

  const [articles, totalCountRes, entities, sources, keywordsRes] = await Promise.all([
    db.select().from(schema.articles).where(and(...conditions)).orderBy(...orderByClause).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.articles).where(and(...conditions)),
    db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true)),
    db.select().from(schema.sources).where(eq(schema.sources.enabled, true)),
    db.execute<{ kw: string; count: number }>(sql`
      select unnest(matched_keywords) as kw, count(*)::int as count
      from articles where false_positive = false
      group by kw order by count desc limit 40
    `),
  ])
  const totalCount = totalCountRes[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const sourceMap = new Map(sources.map((s) => [s.id, s]))
  const entityColors = Object.fromEntries(entities.map((e) => [e.slug, e.color]))
  const entityNames = Object.fromEntries(entities.map((e) => [e.slug, e.name]))
  const keywords = keywordsRes.rows.map((r) => ({ kw: r.kw, count: r.count }))

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">MUDA News Monitor</h1>
        <p className="text-neutral-400 text-sm mt-1">Tracking Parti MUDA coverage across Malaysian media.</p>
      </header>
      <FilterBar
        entities={entities.map((e) => ({ slug: e.slug, name: e.name, color: e.color }))}
        sources={sources.map((s) => ({ id: s.id, name: s.name }))}
        keywords={keywords}
      />
      <div className="flex items-center justify-between text-sm text-neutral-400">
        <span>
          {totalCount} article{totalCount === 1 ? '' : 's'}
          {page > 1 && <> · page {page} of {totalPages}</>}
        </span>
        <span className="text-xs">
          Sorted by {sort === 'newest' ? 'newest first' : sort === 'oldest' ? 'oldest first' : 'most keyword matches'}
        </span>
      </div>
      {articles.length === 0 ? (
        <p className="text-neutral-500">No articles match your filters yet.</p>
      ) : (
        <div className="space-y-4">
          {articles.map((a) => (
            <ArticleCard
              key={a.id}
              id={a.id}
              sourceId={a.sourceId}
              sourceName={sourceMap.get(a.sourceId)?.name ?? a.sourceId}
              url={a.url}
              title={a.title}
              publishedAt={a.publishedAt}
              aiSummary={a.aiSummary}
              snippet={a.snippet}
              matchedEntities={a.matchedEntities}
              enrichmentStatus={a.enrichmentStatus}
              entityColors={entityColors}
              entityNames={entityNames}
            />
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} hasMore={page < totalPages} params={params} />
    </div>
  )
}

function Pagination({ page, totalPages, hasMore, params }: { page: number; totalPages: number; hasMore: boolean; params: Search }) {
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== 'page') base.set(k, v)
  }
  const prev = new URLSearchParams(base)
  prev.set('page', String(Math.max(1, page - 1)))
  const next = new URLSearchParams(base)
  next.set('page', String(page + 1))
  return (
    <nav className="flex items-center justify-between text-sm text-neutral-400 pt-4">
      <div>{page > 1 && <a href={`/?${prev.toString()}`} className="hover:text-white">← Newer</a>}</div>
      <div className="text-xs">Page {page} of {totalPages}</div>
      <div>{hasMore && <a href={`/?${next.toString()}`} className="hover:text-white">Older →</a>}</div>
    </nav>
  )
}
