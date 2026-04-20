import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { reportMismatch } from './actions'

export const dynamic = 'force-dynamic'

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await db.select().from(schema.articles).where(eq(schema.articles.id, id)).limit(1)
  if (rows.length === 0) notFound()
  const a = rows[0]
  const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, a.sourceId))

  return (
    <article className="max-w-3xl mx-auto p-6 space-y-6">
      <a href="/" className="text-sm text-neutral-400 hover:text-white">← Back</a>
      <header className="space-y-2">
        <div className="text-xs text-neutral-500">{source?.name} · {a.publishedAt?.toISOString() ?? 'unknown date'}</div>
        <h1 className="text-2xl font-semibold">{a.title}</h1>
        <a href={a.url} target="_blank" rel="noopener noreferrer"
           className="inline-block bg-orange-500 text-black rounded px-3 py-1.5 text-sm font-semibold">
          Open original article ↗
        </a>
      </header>
      {a.aiSummary && (
        <section className="border-l-2 border-orange-500 pl-4">
          <h2 className="text-sm text-neutral-500 uppercase">Summary</h2>
          <p className="mt-1">{a.aiSummary}</p>
        </section>
      )}
      {a.fullText && (
        <section>
          <h2 className="text-sm text-neutral-500 uppercase mb-2">Extracted text</h2>
          <div className="text-neutral-200 leading-relaxed whitespace-pre-wrap">{a.fullText}</div>
        </section>
      )}
      <section className="text-xs text-neutral-500 flex items-center gap-3">
        <span>Matched: {a.matchedEntities.join(', ') || 'none'}</span>
        <span>Keywords: {a.matchedKeywords.join(', ') || 'none'}</span>
        <form action={reportMismatch} className="ml-auto">
          <input type="hidden" name="id" value={a.id} />
          <button className="text-red-400 hover:text-red-300">Report mismatch</button>
        </form>
      </section>
    </article>
  )
}
