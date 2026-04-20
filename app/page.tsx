export const dynamic = 'force-dynamic'
export const revalidate = 0

import { db, schema } from '@/lib/db/client'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { ArticleCard } from './_components/article-card'
import { FilterBar } from './_components/filter-bar'

type Search = { entity?: string; source?: string; q?: string; page?: string }

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const pageSize = 25

  const conditions: SQL[] = [eq(schema.articles.falsePositive, false)]
  if (params.entity) conditions.push(sql`${schema.articles.matchedEntities} @> ARRAY[${params.entity}]::text[]`)
  if (params.source) conditions.push(eq(schema.articles.sourceId, params.source))
  if (params.q) conditions.push(sql`${schema.articles.searchTsv} @@ plainto_tsquery('simple', ${params.q})`)

  const [articles, entities, sources] = await Promise.all([
    db.select().from(schema.articles).where(and(...conditions)).orderBy(desc(schema.articles.publishedAt), desc(schema.articles.discoveredAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true)),
    db.select().from(schema.sources).where(eq(schema.sources.enabled, true)),
  ])

  const sourceMap = new Map(sources.map((s) => [s.id, s]))
  const entityColors = Object.fromEntries(entities.map((e) => [e.slug, e.color]))
  const entityNames = Object.fromEntries(entities.map((e) => [e.slug, e.name]))

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">MUDA News Monitor</h1>
        <p className="text-neutral-400 text-sm mt-1">Tracking Parti MUDA coverage across Malaysian media.</p>
      </header>
      <FilterBar
        entities={entities.map((e) => ({ slug: e.slug, name: e.name, color: e.color }))}
        sources={sources.map((s) => ({ id: s.id, name: s.name }))}
      />
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
      <Pagination page={page} hasMore={articles.length === pageSize} params={params} />
    </div>
  )
}

function Pagination({ page, hasMore, params }: { page: number; hasMore: boolean; params: Search }) {
  const base = new URLSearchParams()
  if (params.entity) base.set('entity', params.entity)
  if (params.source) base.set('source', params.source)
  if (params.q) base.set('q', params.q)
  const prev = new URLSearchParams(base)
  prev.set('page', String(Math.max(1, page - 1)))
  const next = new URLSearchParams(base)
  next.set('page', String(page + 1))
  return (
    <nav className="flex items-center justify-between text-sm text-neutral-400 pt-4">
      <div>{page > 1 && <a href={`/?${prev.toString()}`}>← Newer</a>}</div>
      <div>{hasMore && <a href={`/?${next.toString()}`}>Older →</a>}</div>
    </nav>
  )
}
