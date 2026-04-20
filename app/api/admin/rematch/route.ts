import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db, schema } from '@/lib/db/client'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import { eq } from 'drizzle-orm'
import { verifyToken, ADMIN_COOKIE_NAME } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  await runRematchAllArticles()
  return NextResponse.json({ ok: true })
}

export async function runRematchAllArticles() {
  const entitiesDb = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  const entities: MatcherEntity[] = entitiesDb.map((e) => ({
    slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind,
  }))
  const articles = await db.select({ id: schema.articles.id, title: schema.articles.title, fullText: schema.articles.fullText, snippet: schema.articles.snippet }).from(schema.articles)

  for (const a of articles) {
    const text = `${a.title}\n${a.fullText ?? a.snippet ?? ''}`
    const r = matchText(text, entities)
    const combined = r.scope.length > 0 ? [...r.scope, ...r.tag] : []
    await db.update(schema.articles).set({
      matchedEntities: combined,
      matchedKeywords: r.matchedKeywords,
    }).where(eq(schema.articles.id, a.id))
  }
}
