import { db, schema } from './client'
import { and, eq, inArray, sql } from 'drizzle-orm'

export async function getEnabledSources() {
  return db.select().from(schema.sources).where(eq(schema.sources.enabled, true))
}

export async function getEnabledEntities() {
  return db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
}

export async function findExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set()
  const rows = await db.select({ url: schema.articles.url })
    .from(schema.articles)
    .where(inArray(schema.articles.url, urls))
  return new Set(rows.map((r) => r.url))
}

export type NewArticleInput = {
  sourceId: string
  url: string
  title: string
  publishedAt: Date | null
  snippet: string | null
  matchedEntities: string[]
  matchedKeywords: string[]
}

export async function insertArticles(rows: NewArticleInput[]) {
  if (rows.length === 0) return 0
  await db.insert(schema.articles).values(rows).onConflictDoNothing({ target: schema.articles.url })
  return rows.length
}

export async function recordCronRun(input: {
  kind: 'poll' | 'enrich' | 'backfill'
  sourceId?: string | null
  articlesDiscovered?: number
  articlesEnriched?: number
  errors?: unknown[]
  status: 'ok' | 'partial' | 'failed'
}) {
  await db.insert(schema.cronRuns).values({
    kind: input.kind,
    sourceId: input.sourceId ?? null,
    articlesDiscovered: input.articlesDiscovered ?? 0,
    articlesEnriched: input.articlesEnriched ?? 0,
    errors: (input.errors ?? []) as never,
    status: input.status,
    finishedAt: new Date(),
  })
}

export async function getPendingArticles(limit = 20) {
  return db.select()
    .from(schema.articles)
    .where(and(eq(schema.articles.enrichmentStatus, 'pending'), sql`${schema.articles.enrichmentAttempts} < 3`))
    .orderBy(sql`${schema.articles.publishedAt} desc nulls last`)
    .limit(limit)
}

export async function updateArticleEnriched(id: string, data: {
  fullText: string
  aiSummary: string | null
  matchedEntities: string[]
  matchedKeywords: string[]
}) {
  await db.update(schema.articles).set({
    fullText: data.fullText,
    aiSummary: data.aiSummary,
    matchedEntities: data.matchedEntities,
    matchedKeywords: data.matchedKeywords,
    enrichmentStatus: 'done',
    enrichmentError: null,
  }).where(eq(schema.articles.id, id))
}

export async function bumpArticleFailure(id: string, error: string) {
  await db.update(schema.articles).set({
    enrichmentAttempts: sql`${schema.articles.enrichmentAttempts} + 1`,
    enrichmentError: error,
    enrichmentStatus: sql`case when ${schema.articles.enrichmentAttempts} + 1 >= 3 then 'failed'::enrichment_status else 'pending'::enrichment_status end`,
  }).where(eq(schema.articles.id, id))
}
