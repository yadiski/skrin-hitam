import { db, schema } from '@/lib/db/client'
import { and, asc, desc, sql, type SQL } from 'drizzle-orm'
import { DeckCard } from './deck-card'

type Props = {
  entity: { slug: string; name: string; color: string; kind: 'scope' | 'tag' }
  conditions: SQL[]
  sort: 'newest' | 'oldest' | 'relevance'
  sourceMap: Map<string, { id: string; name: string }>
  entityColors: Record<string, string>
  entityNames: Record<string, string>
  limit?: number
}

export async function DeckColumn({ entity, conditions, sort, sourceMap, entityColors, entityNames, limit = 50 }: Props) {
  const entityCondition = sql`${schema.articles.matchedEntities} @> ARRAY[${entity.slug}]::text[]`
  const allConditions = [...conditions, entityCondition]

  const orderByClause = (() => {
    if (sort === 'oldest') return [sql`${schema.articles.publishedAt} asc nulls last`, asc(schema.articles.discoveredAt)]
    if (sort === 'relevance') return [sql`coalesce(array_length(${schema.articles.matchedKeywords}, 1), 0) desc`, desc(schema.articles.publishedAt)]
    return [sql`${schema.articles.publishedAt} desc nulls last`, desc(schema.articles.discoveredAt)]
  })()

  const [articles, countRes] = await Promise.all([
    db.select().from(schema.articles).where(and(...allConditions)).orderBy(...orderByClause).limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.articles).where(and(...allConditions)),
  ])
  const total = countRes[0]?.count ?? 0

  return (
    <section
      className="flex-shrink-0 w-[360px] flex flex-col border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden"
      style={{ scrollSnapAlign: 'start' }}
    >
      <header className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-neutral-800 bg-neutral-900/60">
        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entity.color }} />
        <h2 className="text-sm font-semibold flex-1 truncate text-neutral-100">{entity.name}</h2>
        <span className="text-xs text-neutral-500 tabular-nums">{total}</span>
      </header>
      <div className="flex-1 overflow-y-auto">
        {articles.length === 0 ? (
          <p className="text-xs text-neutral-500 p-6 text-center">No articles match.</p>
        ) : (
          articles.map((a) => (
            <DeckCard
              key={a.id}
              id={a.id}
              url={a.url}
              title={a.title}
              sourceName={sourceMap.get(a.sourceId)?.name ?? a.sourceId}
              publishedAt={a.publishedAt}
              aiSummary={a.aiSummary}
              snippet={a.snippet}
              matchedEntities={a.matchedEntities}
              enrichmentStatus={a.enrichmentStatus}
              entityColors={entityColors}
              entityNames={entityNames}
              primaryEntity={entity.slug}
            />
          ))
        )}
      </div>
    </section>
  )
}
