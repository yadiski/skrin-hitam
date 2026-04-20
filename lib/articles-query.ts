import { db, schema } from './db/client'
import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'

export type ArticleRow = {
  id: string
  url: string
  title: string
  sourceId: string
  publishedAt: Date | null
  aiSummary: string | null
  snippet: string | null
  matchedEntities: string[]
  enrichmentStatus: 'pending' | 'done' | 'failed'
}

export type SortMode = 'newest' | 'oldest' | 'relevance'

export type Filter = {
  source?: string
  q?: string
  kw?: string
  from?: string
  to?: string
}

function applyFilter(filter: Filter, conditions: SQL[]) {
  if (filter.source) conditions.push(eq(schema.articles.sourceId, filter.source))
  if (filter.q) conditions.push(sql`${schema.articles.searchTsv} @@ plainto_tsquery('simple', ${filter.q})`)
  if (filter.kw) conditions.push(sql`${schema.articles.matchedKeywords} @> ARRAY[${filter.kw.toLowerCase()}]::text[]`)
  if (filter.from) {
    const d = new Date(filter.from)
    if (!isNaN(d.getTime())) conditions.push(gte(schema.articles.publishedAt, d))
  }
  if (filter.to) {
    const d = new Date(filter.to)
    if (!isNaN(d.getTime())) {
      d.setUTCHours(23, 59, 59, 999)
      conditions.push(lte(schema.articles.publishedAt, d))
    }
  }
}

export function buildColumnConditions(entitySlug: string, global: Filter, column: Filter): SQL[] {
  const conditions: SQL[] = [
    eq(schema.articles.falsePositive, false),
    sql`${schema.articles.matchedEntities} @> ARRAY[${entitySlug}]::text[]`,
  ]
  // Column filter overrides global on a per-field basis.
  const effective: Filter = {
    source: column.source ?? global.source,
    q: column.q ?? global.q,
    kw: column.kw ?? global.kw,
    from: column.from ?? global.from,
    to: column.to ?? global.to,
  }
  applyFilter(effective, conditions)
  return conditions
}

export function sortToOrderBy(sort: SortMode): SQL[] {
  if (sort === 'oldest') return [sql`${schema.articles.publishedAt} asc nulls last`, asc(schema.articles.discoveredAt)]
  if (sort === 'relevance') return [sql`coalesce(array_length(${schema.articles.matchedKeywords}, 1), 0) desc`, desc(schema.articles.publishedAt)]
  return [sql`${schema.articles.publishedAt} desc nulls last`, desc(schema.articles.discoveredAt)]
}

export async function fetchColumnArticles(
  entitySlug: string,
  global: Filter,
  column: Filter,
  sort: SortMode,
  offset: number,
  limit: number,
): Promise<ArticleRow[]> {
  const conditions = buildColumnConditions(entitySlug, global, column)
  const orderBy = sortToOrderBy(sort)
  const rows = await db.select({
    id: schema.articles.id,
    url: schema.articles.url,
    title: schema.articles.title,
    sourceId: schema.articles.sourceId,
    publishedAt: schema.articles.publishedAt,
    aiSummary: schema.articles.aiSummary,
    snippet: schema.articles.snippet,
    matchedEntities: schema.articles.matchedEntities,
    enrichmentStatus: schema.articles.enrichmentStatus,
  })
    .from(schema.articles)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .offset(offset)
    .limit(limit)
  return rows as ArticleRow[]
}

export async function countColumnArticles(
  entitySlug: string,
  global: Filter,
  column: Filter,
): Promise<number> {
  const conditions = buildColumnConditions(entitySlug, global, column)
  const rows = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.articles)
    .where(and(...conditions))
  return rows[0]?.count ?? 0
}
