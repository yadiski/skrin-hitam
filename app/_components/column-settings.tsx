'use client'
import { useState } from 'react'

type Props = {
  allEntities: { slug: string; name: string; color: string }[]
  visibleSlugs: string[]
  onToggle: (slug: string) => void
}

export function ColumnSettings({ allEntities, visibleSlugs, onToggle }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs px-2 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
      >
        ⋮ Columns · {visibleSlugs.length}/{allEntities.length}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 w-56 bg-neutral-900 border border-neutral-700 rounded shadow-xl z-20 py-1">
            <div className="px-3 py-1.5 text-[10px] text-neutral-500 uppercase tracking-wider border-b border-neutral-800">
              Visible columns
            </div>
            {allEntities.map((e) => (
              <label key={e.slug} className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleSlugs.includes(e.slug)}
                  onChange={() => onToggle(e.slug)}
                />
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                <span className="text-xs text-neutral-200">{e.name}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
