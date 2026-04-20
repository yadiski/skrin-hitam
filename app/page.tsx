export const dynamic = 'force-dynamic'
export const revalidate = 0

import { db, schema } from '@/lib/db/client'
import { asc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { DeckColumn } from './_components/deck-column'
import { FilterBar } from './_components/filter-bar'

type Search = {
  entity?: string
  source?: string
  q?: string
  kw?: string
  from?: string
  to?: string
  sort?: string
}

type SortMode = 'newest' | 'oldest' | 'relevance'
const VALID_SORTS: SortMode[] = ['newest', 'oldest', 'relevance']

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const sort: SortMode = VALID_SORTS.includes(params.sort as SortMode) ? (params.sort as SortMode) : 'newest'

  const conditions: SQL[] = [eq(schema.articles.falsePositive, false)]
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

  const [entities, sources, keywordsRes] = await Promise.all([
    db.select().from(schema.trackedEntities)
      .where(eq(schema.trackedEntities.enabled, true))
      .orderBy(asc(schema.trackedEntities.kind), asc(schema.trackedEntities.createdAt)),
    db.select().from(schema.sources).where(eq(schema.sources.enabled, true)),
    db.execute<{ kw: string; count: number }>(sql`
      select unnest(matched_keywords) as kw, count(*)::int as count
      from articles where false_positive = false
      group by kw order by count desc limit 40
    `),
  ])

  const sourceMap = new Map(sources.map((s) => [s.id, { id: s.id, name: s.name }]))
  const entityColors = Object.fromEntries(entities.map((e) => [e.slug, e.color]))
  const entityNames = Object.fromEntries(entities.map((e) => [e.slug, e.name]))
  const keywords = keywordsRes.rows.map((r) => ({ kw: r.kw, count: r.count }))

  // Focus mode: ?entity=slug collapses the deck to that single column.
  const displayEntities = params.entity
    ? entities.filter((e) => e.slug === params.entity)
    : entities

  return (
    <div className="h-screen flex flex-col">
      <header className="flex-shrink-0 border-b border-neutral-800 px-4 py-3 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold leading-none">MUDA News Monitor</h1>
          <p className="text-[11px] text-neutral-500 mt-1 leading-none">Tracking Parti MUDA coverage across Malaysian media</p>
        </div>
        <div className="flex-1" />
        {params.entity && (
          <a href="/" className="text-xs px-2 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700">
            ← All columns
          </a>
        )}
      </header>
      <div className="flex-shrink-0 border-b border-neutral-800 px-4 py-2.5">
        <FilterBar sources={sources.map((s) => ({ id: s.id, name: s.name }))} keywords={keywords} />
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex gap-3 p-3" style={{ scrollSnapType: 'x proximity' }}>
          {displayEntities.length === 0 ? (
            <div className="m-auto text-center text-neutral-500 text-sm">
              No entities found. Visit <a href="/admin/entities" className="text-orange-400 hover:underline">/admin/entities</a> to add one.
            </div>
          ) : (
            displayEntities.map((e) => (
              <DeckColumn
                key={e.slug}
                entity={{ slug: e.slug, name: e.name, color: e.color, kind: e.kind }}
                conditions={conditions}
                sort={sort}
                sourceMap={sourceMap}
                entityColors={entityColors}
                entityNames={entityNames}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
