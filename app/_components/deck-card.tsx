import Link from 'next/link'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)

type Props = {
  id: string
  url: string
  title: string
  sourceName: string
  publishedAt: Date | null
  aiSummary: string | null
  snippet: string | null
  matchedEntities: string[]
  enrichmentStatus: 'pending' | 'done' | 'failed'
  entityColors: Record<string, string>
  entityNames: Record<string, string>
  primaryEntity: string
}

export function DeckCard(p: Props) {
  const otherEntities = p.matchedEntities.filter((e) => e !== p.primaryEntity)
  return (
    <article className="border-b border-neutral-800 px-3 py-2.5 hover:bg-neutral-900/50 transition-colors">
      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-neutral-500 leading-none">
        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">{p.sourceName}</span>
        <span aria-hidden>·</span>
        <span>{p.publishedAt ? dayjs(p.publishedAt).fromNow() : 'unknown'}</span>
      </div>
      <h3 className="text-sm font-semibold leading-snug mb-1 text-neutral-100">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.title}</a>
      </h3>
      {p.enrichmentStatus === 'done' && p.aiSummary ? (
        <p className="text-xs text-neutral-300 leading-[1.45] line-clamp-3">{p.aiSummary}</p>
      ) : p.enrichmentStatus === 'pending' ? (
        <p className="text-xs text-neutral-500 italic">Summary pending…</p>
      ) : p.snippet ? (
        <p className="text-xs text-neutral-400 italic line-clamp-2">{p.snippet}</p>
      ) : null}
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {otherEntities.map((slug) => (
          <span
            key={slug}
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${p.entityColors[slug] ?? '#6b7280'}33`, color: p.entityColors[slug] ?? '#a3a3a3' }}
          >
            {p.entityNames[slug] ?? slug}
          </span>
        ))}
        <Link href={`/article/${p.id}`} className="ml-auto text-[10px] text-neutral-500 hover:text-neutral-300">Details →</Link>
      </div>
    </article>
  )
}
