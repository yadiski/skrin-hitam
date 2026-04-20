'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DeckColumnView } from './deck-column-view'
import { FilterBar } from './filter-bar'
import { ColumnSettings } from './column-settings'
import type { ArticleRow, Filter, SortMode } from '@/lib/articles-query'

type Entity = { slug: string; name: string; color: string; kind: 'scope' | 'tag' }

type ColumnData = { slug: string; articles: ArticleRow[]; total: number }

type Props = {
  allEntities: Entity[]
  defaultVisibleSlugs: string[]
  columnFilters: Record<string, Filter>
  globalFilter: Filter
  sort: SortMode
  initialData: ColumnData[]
  sources: { id: string; name: string }[]
  sourceMap: Record<string, { id: string; name: string }>
  keywords: { kw: string; count: number }[]
  entityColors: Record<string, string>
  entityNames: Record<string, string>
  focusMode: boolean
}

const STORAGE_KEY = 'deck.order.v1'

export function DeckLayout(p: Props) {
  const router = useRouter()
  const params = useSearchParams()

  // Read initial order from URL ?cols=, else localStorage, else default.
  const [orderSlugs, setOrderSlugs] = useState<string[]>(p.defaultVisibleSlugs)

  useEffect(() => {
    // If URL has explicit ?cols= or ?entity=, trust it. Else hydrate from localStorage.
    if (params.get('cols') || params.get('entity')) {
      setOrderSlugs(p.defaultVisibleSlugs)
      return
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const stored: string[] = JSON.parse(raw)
      if (!Array.isArray(stored) || stored.length === 0) return
      const valid = stored.filter((s) => p.allEntities.some((e) => e.slug === s))
      if (valid.length > 0) setOrderSlugs(valid)
    } catch {
      // ignore malformed storage
    }
  }, [params, p.defaultVisibleSlugs, p.allEntities])

  const persist = useCallback((next: string[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* noop */ }
    const sp = new URLSearchParams(params.toString())
    if (next.length === p.allEntities.length && p.allEntities.every((e) => next.includes(e.slug))) {
      sp.delete('cols')
    } else {
      sp.set('cols', next.join(','))
    }
    router.replace(`/?${sp.toString()}`, { scroll: false })
  }, [params, router, p.allEntities])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderSlugs.indexOf(String(active.id))
    const newIndex = orderSlugs.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(orderSlugs, oldIndex, newIndex)
    setOrderSlugs(next)
    persist(next)
  }, [orderSlugs, persist])

  const toggleColumn = useCallback((slug: string) => {
    const next = orderSlugs.includes(slug)
      ? orderSlugs.filter((s) => s !== slug)
      : [...orderSlugs, slug]
    setOrderSlugs(next)
    persist(next)
  }, [orderSlugs, persist])

  // Auto-refresh on window focus. Avoid interval-based refreshes so deep scroll
  // state in infinite-scrolled columns isn't reset out from under the user.
  useEffect(() => {
    const onFocus = () => router.refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [router])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const dataBySlug = new Map(p.initialData.map((d) => [d.slug, d]))

  return (
    <div className="h-screen flex flex-col">
      <header className="flex-shrink-0 border-b border-neutral-800 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold leading-none">MUDA News Monitor</h1>
          <p className="text-[11px] text-neutral-500 mt-1 leading-none">Tracking Parti MUDA coverage across Malaysian media</p>
        </div>
        <div className="flex-1" />
        {!p.focusMode && (
          <ColumnSettings allEntities={p.allEntities} visibleSlugs={orderSlugs} onToggle={toggleColumn} />
        )}
        <button
          type="button"
          onClick={() => router.refresh()}
          className="text-xs px-2 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
          title="Refresh all columns"
        >
          ↻
        </button>
        {p.focusMode && (
          <a href="/" className="text-xs px-2 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700">
            ← All columns
          </a>
        )}
      </header>
      <div className="flex-shrink-0 border-b border-neutral-800 px-4 py-2.5">
        <FilterBar sources={p.sources} keywords={p.keywords} />
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderSlugs} strategy={horizontalListSortingStrategy}>
            <div className="h-full flex gap-3 p-3" style={{ scrollSnapType: 'x proximity' }}>
              {orderSlugs.length === 0 ? (
                <EmptyDeck />
              ) : (
                orderSlugs.map((slug) => {
                  const entity = p.allEntities.find((e) => e.slug === slug)
                  const data = dataBySlug.get(slug)
                  if (!entity) return null
                  return (
                    <SortableColumn
                      key={slug}
                      slug={slug}
                      entity={entity}
                      data={data ?? { slug, articles: [], total: 0 }}
                      columnFilter={p.columnFilters[slug] ?? {}}
                      globalFilter={p.globalFilter}
                      sort={p.sort}
                      sources={p.sources}
                      sourceMap={p.sourceMap}
                      keywords={p.keywords}
                      entityColors={p.entityColors}
                      entityNames={p.entityNames}
                    />
                  )
                })
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

type SortableColumnProps = {
  slug: string
  entity: Entity
  data: ColumnData
  columnFilter: Filter
  globalFilter: Filter
  sort: SortMode
  sources: { id: string; name: string }[]
  sourceMap: Record<string, { id: string; name: string }>
  keywords: { kw: string; count: number }[]
  entityColors: Record<string, string>
  entityNames: Record<string, string>
}

function SortableColumn(p: SortableColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.slug })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    scrollSnapAlign: 'start' as const,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0 h-full">
      <DeckColumnView
        entity={p.entity}
        initialArticles={p.data.articles}
        total={p.data.total}
        columnFilter={p.columnFilter}
        globalFilter={p.globalFilter}
        sort={p.sort}
        sources={p.sources}
        sourceMap={p.sourceMap}
        keywords={p.keywords}
        entityColors={p.entityColors}
        entityNames={p.entityNames}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLDivElement>}
      />
    </div>
  )
}

function EmptyDeck() {
  return (
    <div className="m-auto text-center text-neutral-500 text-sm">
      No columns visible.<br />
      <span className="text-xs">Open <strong>⋮ Columns</strong> to re-enable some, or visit <a href="/admin/entities" className="text-orange-400 hover:underline">/admin/entities</a> to add entities.</span>
    </div>
  )
}
