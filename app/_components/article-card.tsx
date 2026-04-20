import Link from 'next/link'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)

type ArticleCardProps = {
  id: string
  sourceId: string
  sourceName: string
  sourceColor?: string
  url: string
  title: string
  publishedAt: Date | null
  aiSummary: string | null
  snippet: string | null
  matchedEntities: string[]
  enrichmentStatus: 'pending' | 'done' | 'failed'
  entityColors: Record<string, string>
  entityNames: Record<string, string>
}

export function ArticleCard(p: ArticleCardProps) {
  return (
    <article className="border border-neutral-800 rounded-lg p-4 space-y-3 hover:border-neutral-700">
      <div className="flex items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">{p.sourceName}</span>
        <span className="text-neutral-500">{p.publishedAt ? dayjs(p.publishedAt).fromNow() : 'unknown'}</span>
      </div>
      <h2 className="text-lg font-semibold leading-tight">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.title}</a>
      </h2>
      {p.enrichmentStatus === 'done' && p.aiSummary ? (
        <p className="text-neutral-300">{p.aiSummary}</p>
      ) : p.enrichmentStatus === 'pending' ? (
        <p className="text-neutral-500 italic">Summary pending…</p>
      ) : p.snippet ? (
        <p className="text-neutral-400 italic">{p.snippet}</p>
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        {p.matchedEntities.map((slug) => (
          <span key={slug} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${p.entityColors[slug] ?? '#6b7280'}33`, color: p.entityColors[slug] ?? '#6b7280' }}>
            {p.entityNames[slug] ?? slug}
          </span>
        ))}
        <Link href={`/article/${p.id}`} className="ml-auto text-xs text-neutral-500 hover:text-neutral-300">Details →</Link>
      </div>
    </article>
  )
}
