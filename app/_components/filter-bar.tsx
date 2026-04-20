'use client'
import { useRouter, useSearchParams } from 'next/navigation'

type Props = {
  sources: { id: string; name: string }[]
  keywords: { kw: string; count: number }[]
}

export function FilterBar({ sources, keywords }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const currentSource = params.get('source') ?? ''
  const currentQ = params.get('q') ?? ''
  const currentKw = params.get('kw') ?? ''
  const currentFrom = params.get('from') ?? ''
  const currentTo = params.get('to') ?? ''
  const currentSort = params.get('sort') ?? 'newest'

  function set(name: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(name, value); else next.delete(name)
    router.push(`/?${next.toString()}`)
  }

  const hasActiveFilters = !!(currentSource || currentQ || currentKw || currentFrom || currentTo || currentSort !== 'newest')

  return (
    <div className="flex items-center gap-3 flex-wrap text-xs">
      <Field label="Source">
        <select value={currentSource} onChange={(e) => set('source', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1">
          <option value="">All</option>
          {sources.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
      </Field>

      <Field label="Keyword">
        <select value={currentKw} onChange={(e) => set('kw', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 max-w-[200px]">
          <option value="">Any</option>
          {keywords.map((k) => (<option key={k.kw} value={k.kw}>{k.kw} ({k.count})</option>))}
        </select>
      </Field>

      <Field label="Sort">
        <select value={currentSort} onChange={(e) => set('sort', e.target.value === 'newest' ? '' : e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="relevance">Most keywords</option>
        </select>
      </Field>

      <Field label="From">
        <input type="date" value={currentFrom} onChange={(e) => set('from', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1" />
      </Field>

      <Field label="To">
        <input type="date" value={currentTo} onChange={(e) => set('to', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1" />
      </Field>

      <input
        key={currentQ}
        defaultValue={currentQ}
        placeholder="Full-text search…"
        onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 flex-1 min-w-[160px]"
      />

      {hasActiveFilters && (
        <button
          onClick={() => router.push('/')}
          className="px-2 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}
