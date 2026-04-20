export const dynamic = 'force-dynamic'
export const revalidate = 0

import { db, schema } from '@/lib/db/client'
import { asc, eq, sql } from 'drizzle-orm'
import { DeckLayout } from './_components/deck-layout'
import {
  countColumnArticles,
  fetchColumnArticles,
  type Filter,
  type SortMode,
} from '@/lib/articles-query'

type Search = Record<string, string | undefined>

const VALID_SORTS: SortMode[] = ['newest', 'oldest', 'relevance']
const GLOBAL_FIELDS = new Set(['source', 'q', 'kw', 'from', 'to', 'sort', 'cols', 'entity', 'page'])
const COLUMN_FIELDS = new Set<keyof Filter>(['source', 'q', 'kw', 'from', 'to'])
const INITIAL_LIMIT = 50

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const sort: SortMode = VALID_SORTS.includes(params.sort as SortMode) ? (params.sort as SortMode) : 'newest'

  const globalFilter: Filter = {
    source: params.source,
    q: params.q,
    kw: params.kw,
    from: params.from,
    to: params.to,
  }

  // Parse per-column filters from URL keys like "<slug>.source".
  const columnFilters: Record<string, Filter> = {}
  for (const [key, val] of Object.entries(params)) {
    if (!val || GLOBAL_FIELDS.has(key)) continue
    const idx = key.indexOf('.')
    if (idx < 0) continue
    const slug = key.slice(0, idx)
    const field = key.slice(idx + 1) as keyof Filter
    if (!COLUMN_FIELDS.has(field)) continue
    columnFilters[slug] = { ...(columnFilters[slug] ?? {}), [field]: val }
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

  // Visible order: ?entity= overrides, else ?cols=, else all entities.
  const focusMode = Boolean(params.entity)
  let defaultVisibleSlugs: string[]
  if (focusMode) {
    defaultVisibleSlugs = [params.entity!]
  } else if (params.cols) {
    const requested = params.cols.split(',').map((s) => s.trim()).filter(Boolean)
    defaultVisibleSlugs = requested.filter((s) => entities.some((e) => e.slug === s))
  } else {
    defaultVisibleSlugs = entities.map((e) => e.slug)
  }

  const visibleEntities = defaultVisibleSlugs
    .map((s) => entities.find((e) => e.slug === s))
    .filter((e): e is typeof entities[number] => e !== undefined)

  const initialData = await Promise.all(
    visibleEntities.map(async (e) => {
      const colFilter = columnFilters[e.slug] ?? {}
      const [articles, total] = await Promise.all([
        fetchColumnArticles(e.slug, globalFilter, colFilter, sort, 0, INITIAL_LIMIT),
        countColumnArticles(e.slug, globalFilter, colFilter),
      ])
      return { slug: e.slug, articles, total }
    })
  )

  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, { id: s.id, name: s.name }]))
  const entityColors = Object.fromEntries(entities.map((e) => [e.slug, e.color]))
  const entityNames = Object.fromEntries(entities.map((e) => [e.slug, e.name]))

  return (
    <DeckLayout
      allEntities={entities.map((e) => ({ slug: e.slug, name: e.name, color: e.color, kind: e.kind }))}
      defaultVisibleSlugs={defaultVisibleSlugs}
      columnFilters={columnFilters}
      globalFilter={globalFilter}
      sort={sort}
      initialData={initialData}
      sources={sources.map((s) => ({ id: s.id, name: s.name }))}
      sourceMap={sourceMap}
      keywords={keywordsRes.rows.map((r) => ({ kw: r.kw, count: r.count }))}
      entityColors={entityColors}
      entityNames={entityNames}
      focusMode={focusMode}
    />
  )
}
