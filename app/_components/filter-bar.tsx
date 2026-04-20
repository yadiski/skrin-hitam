'use client'
import { useRouter, useSearchParams } from 'next/navigation'

type Props = {
  entities: { slug: string; name: string; color: string }[]
  sources: { id: string; name: string }[]
}

export function FilterBar({ entities, sources }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const currentEntity = params.get('entity') ?? ''
  const currentSource = params.get('source') ?? ''
  const currentQ = params.get('q') ?? ''

  function set(name: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(name, value); else next.delete(name)
    router.push(`/?${next.toString()}`)
  }

  return (
    <div className="flex items-center gap-3 flex-wrap p-4 border border-neutral-800 rounded-lg bg-neutral-900/40">
      <div className="flex gap-1 flex-wrap">
        <button onClick={() => set('entity', '')} className={`text-xs px-2 py-1 rounded ${!currentEntity ? 'bg-orange-500 text-black' : 'bg-neutral-800 text-neutral-300'}`}>All</button>
        {entities.map((e) => (
          <button key={e.slug} onClick={() => set('entity', e.slug)} className={`text-xs px-2 py-1 rounded ${currentEntity === e.slug ? 'bg-orange-500 text-black' : 'bg-neutral-800 text-neutral-300'}`}>{e.name}</button>
        ))}
      </div>
      <select value={currentSource} onChange={(e) => set('source', e.target.value)} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm">
        <option value="">All sources</option>
        {sources.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
      </select>
      <input
        defaultValue={currentQ}
        placeholder="Search…"
        onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm flex-1 min-w-[160px]"
      />
    </div>
  )
}
