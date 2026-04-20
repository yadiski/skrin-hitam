'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react'
import { DeckCard } from './deck-card'
import { ColumnFilterPopover } from './column-filter-popover'
import { NewArticlesPill } from './new-articles-pill'
import { countNewSince, fetchNewSince, loadMoreForColumn } from '../actions'
import type { ArticleRow, Filter, SortMode } from '@/lib/articles-query'

type Props = {
  entity: { slug: string; name: string; color: string; kind: 'scope' | 'tag' }
  initialArticles: ArticleRow[]
  total: number
  columnFilter: Filter
  globalFilter: Filter
  sort: SortMode
  sources: { id: string; name: string }[]
  keywords: { kw: string; count: number }[]
  sourceMap: Record<string, { id: string; name: string }>
  entityColors: Record<string, string>
  entityNames: Record<string, string>
  dragHandleProps?: HTMLAttributes<HTMLDivElement>
}

const PAGE_SIZE = 25
const NEW_POLL_INTERVAL_MS = 45_000

function newestDiscoveredAt(rows: ArticleRow[]): string | null {
  if (rows.length === 0) return null
  let max = new Date(rows[0].discoveredAt).getTime()
  for (let i = 1; i < rows.length; i++) {
    const t = new Date(rows[i].discoveredAt).getTime()
    if (t > max) max = t
  }
  return new Date(max).toISOString()
}

export function DeckColumnView(p: Props) {
  const [articles, setArticles] = useState<ArticleRow[]>(p.initialArticles)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(p.initialArticles.length >= p.total)
  const [newCount, setNewCount] = useState(0)
  const [anchorIso, setAnchorIso] = useState<string | null>(() => newestDiscoveredAt(p.initialArticles))
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Re-sync when server data changes (router.refresh / filter change).
  useEffect(() => {
    setArticles(p.initialArticles)
    setDone(p.initialArticles.length >= p.total)
    setAnchorIso(newestDiscoveredAt(p.initialArticles))
    setNewCount(0)
  }, [p.initialArticles, p.total])

  // Infinite scroll.
  useEffect(() => {
    if (done) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loading || done) return
        setLoading(true)
        try {
          const next = await loadMoreForColumn(
            p.entity.slug,
            articles.length,
            p.globalFilter,
            p.columnFilter,
            p.sort,
            PAGE_SIZE,
          )
          if (next.length === 0 || articles.length + next.length >= p.total) {
            setDone(true)
          }
          setArticles((prev) => [...prev, ...next])
        } finally {
          setLoading(false)
        }
      },
      { root: el.parentElement, rootMargin: '400px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [done, loading, articles.length, p.entity.slug, p.globalFilter, p.columnFilter, p.sort, p.total])

  // Poll for new articles (only when sorting by newest — otherwise "new" semantics are confusing).
  const pollEligible = p.sort === 'newest'
  const globalFilterKey = useMemo(() => JSON.stringify(p.globalFilter), [p.globalFilter])
  const columnFilterKey = useMemo(() => JSON.stringify(p.columnFilter), [p.columnFilter])

  useEffect(() => {
    if (!pollEligible || !anchorIso) return
    let cancelled = false
    const tick = async () => {
      try {
        const count = await countNewSince(p.entity.slug, anchorIso, p.globalFilter, p.columnFilter)
        if (!cancelled) setNewCount(count)
      } catch { /* transient network hiccup — try again next tick */ }
    }
    tick()
    const id = setInterval(tick, NEW_POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [pollEligible, anchorIso, p.entity.slug, globalFilterKey, columnFilterKey, p.globalFilter, p.columnFilter])

  const mergeNew = useCallback(async () => {
    if (!anchorIso || newCount === 0) return
    try {
      const fresh = await fetchNewSince(p.entity.slug, anchorIso, p.globalFilter, p.columnFilter, Math.max(newCount, 25))
      if (fresh.length === 0) {
        setNewCount(0)
        return
      }
      setArticles((prev) => {
        const existing = new Set(prev.map((a) => a.id))
        const dedupedFresh = fresh.filter((a) => !existing.has(a.id))
        return [...dedupedFresh, ...prev]
      })
      setAnchorIso(newestDiscoveredAt(fresh) ?? anchorIso)
      setNewCount(0)
      // scroll column to top so user sees the prepended articles
      scrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { /* will retry via next poll tick */ }
  }, [anchorIso, newCount, p.entity.slug, p.globalFilter, p.columnFilter])

  return (
    <section className="flex-shrink-0 w-[360px] h-full flex flex-col border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden relative">
      <header className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-neutral-800 bg-neutral-900/60">
        <div
          className="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing select-none"
          {...p.dragHandleProps}
        >
          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.entity.color }} />
          <h2 className="text-sm font-semibold flex-1 truncate text-neutral-100">{p.entity.name}</h2>
          <span className="text-xs text-neutral-500 tabular-nums">{p.total + newCount}</span>
        </div>
        <ColumnFilterPopover
          entitySlug={p.entity.slug}
          sources={p.sources}
          keywords={p.keywords}
          currentFilter={p.columnFilter}
        />
      </header>
      <NewArticlesPill count={newCount} onClick={mergeNew} />
      <div ref={scrollerRef} className="flex-1 overflow-y-auto scrollbar-auto">
        {articles.length === 0 ? (
          <p className="text-xs text-neutral-500 p-6 text-center">No articles match.</p>
        ) : (
          articles.map((a) => (
            <DeckCard
              key={a.id}
              id={a.id}
              url={a.url}
              title={a.title}
              sourceName={p.sourceMap[a.sourceId]?.name ?? a.sourceId}
              publishedAt={a.publishedAt}
              aiSummary={a.aiSummary}
              snippet={a.snippet}
              matchedEntities={a.matchedEntities}
              enrichmentStatus={a.enrichmentStatus}
              entityColors={p.entityColors}
              entityNames={p.entityNames}
              primaryEntity={p.entity.slug}
            />
          ))
        )}
        {!done && articles.length > 0 && (
          <div ref={sentinelRef} className="py-4 text-center text-[11px] text-neutral-600">
            {loading ? 'Loading…' : '↓'}
          </div>
        )}
        {done && articles.length > 0 && (
          <div className="py-4 text-center text-[11px] text-neutral-700">End of results</div>
        )}
      </div>
    </section>
  )
}
