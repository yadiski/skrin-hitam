'use client'

type Props = {
  count: number
  onClick: () => void
}

export function NewArticlesPill({ count, onClick }: Props) {
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-orange-500 text-black text-xs font-semibold rounded-full shadow-lg hover:bg-orange-400 transition-colors"
      aria-label={`Show ${count} new articles`}
    >
      ↓ {count} new article{count === 1 ? '' : 's'}
    </button>
  )
}
