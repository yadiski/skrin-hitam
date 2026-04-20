'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Filter } from '@/lib/articles-query'

type Props = {
  entitySlug: string
  sources: { id: string; name: string }[]
  keywords: { kw: string; count: number }[]
  currentFilter: Filter
}

export function ColumnFilterPopover({ entitySlug, sources, keywords, currentFilter }: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const params = useSearchParams()

  const setField = (field: keyof Filter, value: string) => {
    const key = `${entitySlug}.${field}`
    const sp = new URLSearchParams(params.toString())
    if (value) sp.set(key, value)
    else sp.delete(key)
    router.push(`/?${sp.toString()}`)
  }

  const clearAll = () => {
    const sp = new URLSearchParams(params.toString())
    for (const k of Array.from(sp.keys())) {
      if (k.startsWith(`${entitySlug}.`)) sp.delete(k)
    }
    router.push(`/?${sp.toString()}`)
  }

  const activeCount = (Object.values(currentFilter).filter(Boolean) as string[]).length

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`text-[11px] px-1.5 py-0.5 rounded leading-none ${
          activeCount > 0 ? 'bg-orange-500/25 text-orange-200' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
        }`}
        aria-label="Column filters"
        title="Column filters"
      >
        ⚙{activeCount > 0 ? ` ${activeCount}` : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 w-64 bg-neutral-900 border border-neutral-700 rounded shadow-xl z-20 p-3 space-y-2">
            <h4 className="text-[10px] text-neutral-500 uppercase tracking-wider">Column-only filters</h4>
            <p className="text-[10px] text-neutral-600 leading-tight">Override global filters for this column only.</p>
            <Field label="Source">
              <select
                value={currentFilter.source ?? ''}
                onChange={(e) => setField('source', e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"
              >
                <option value="">(use global)</option>
                {sources.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </Field>
            <Field label="Keyword">
              <select
                value={currentFilter.kw ?? ''}
                onChange={(e) => setField('kw', e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"
              >
                <option value="">(use global)</option>
                {keywords.map((k) => (<option key={k.kw} value={k.kw}>{k.kw} ({k.count})</option>))}
              </select>
            </Field>
            <div className="flex gap-2">
              <Field label="From">
                <input
                  type="date"
                  value={currentFilter.from ?? ''}
                  onChange={(e) => setField('from', e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={currentFilter.to ?? ''}
                  onChange={(e) => setField('to', e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"
                />
              </Field>
            </div>
            <Field label="Search">
              <input
                key={currentFilter.q ?? ''}
                defaultValue={currentFilter.q ?? ''}
                onKeyDown={(e) => e.key === 'Enter' && setField('q', (e.target as HTMLInputElement).value)}
                placeholder="Press Enter"
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs"
              />
            </Field>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="w-full text-xs bg-neutral-800 text-neutral-300 rounded px-2 py-1 hover:bg-neutral-700 mt-1"
              >
                Clear column filters
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}
