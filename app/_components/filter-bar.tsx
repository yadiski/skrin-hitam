'use client'
import { useRouter, useSearchParams } from 'next/navigation'

type Props = {
  entities: { slug: string; name: string; color: string }[]
  sources: { id: string; name: string }[]
  keywords: { kw: string; count: number }[]
}

export function FilterBar({ entities, sources, keywords }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const currentEntity = params.get('entity') ?? ''
  const currentSource = params.get('source') ?? ''
  const currentQ = params.get('q') ?? ''
  const currentKw = params.get('kw') ?? ''
  const currentFrom = params.get('from') ?? ''
  const currentTo = params.get('to') ?? ''
  const currentSort = params.get('sort') ?? 'newest'

  function set(name: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(name, value); else next.delete(name)
    next.delete('page')  // always reset pagination on filter change
    router.push(`/?${next.toString()}`)
  }

  const hasActiveFilters = !!(currentEntity || currentSource || currentQ || currentKw || currentFrom || currentTo)

  return (
    <div className="space-y-3 p-4 border border-neutral-800 rounded-lg bg-neutral-900/40">
      {/* Entity chips */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-neutral-500 mr-2 uppercase tracking-wide">Entity:</span>
        <button onClick={() => set('entity', '')} className={`text-xs px-2 py-1 rounded ${!currentEntity ? 'bg-orange-500 text-black' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}>All</button>
        {entities.map((e) => (
          <button key={e.slug} onClick={() => set('entity', e.slug)} className={`text-xs px-2 py-1 rounded ${currentEntity === e.slug ? 'bg-orange-500 text-black' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}>{e.name}</button>
        ))}
      </div>

      {/* Source + Keyword + Sort row */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 uppercase tracking-wide">Source</span>
          <select value={currentSource} onChange={(e) => set('source', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1">
            <option value="">All</option>
            {sources.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 uppercase tracking-wide">Keyword</span>
          <select value={currentKw} onChange={(e) => set('kw', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 max-w-xs">
            <option value="">Any</option>
            {keywords.map((k) => (
              <option key={k.kw} value={k.kw}>{k.kw} ({k.count})</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 uppercase tracking-wide">Sort</span>
          <select value={currentSort} onChange={(e) => set('sort', e.target.value === 'newest' ? '' : e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="relevance">Most keywords matched</option>
          </select>
        </label>
      </div>

      {/* Date range + search */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 uppercase tracking-wide">From</span>
          <input type="date" value={currentFrom} onChange={(e) => set('from', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 uppercase tracking-wide">To</span>
          <input type="date" value={currentTo} onChange={(e) => set('to', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <input
          key={currentQ}
          defaultValue={currentQ}
          placeholder="Full-text search…"
          onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 flex-1 min-w-[180px]"
        />
        {hasActiveFilters && (
          <button
            onClick={() => router.push('/')}
            className="text-xs px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
