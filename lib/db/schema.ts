import {
  pgTable, text, uuid, boolean, timestamp, integer, jsonb, pgEnum,
  index, uniqueIndex, customType,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// tsvector column (Drizzle has no native type)
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() { return 'tsvector' },
})

export const enrichmentStatus = pgEnum('enrichment_status', ['pending', 'done', 'failed'])
export const cronKind = pgEnum('cron_kind', ['poll', 'enrich', 'backfill'])
export const cronStatus = pgEnum('cron_status', ['ok', 'partial', 'failed'])
export const entityKind = pgEnum('entity_kind', ['scope', 'tag'])

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rssUrl: text('rss_url').notNull(),
  baseUrl: text('base_url').notNull(),
  language: text('language').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastAlertedAt: timestamp('last_alerted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const trackedEntities = pgTable('tracked_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  keywords: text('keywords').array().notNull().default(sql`ARRAY[]::text[]`),
  requireAny: text('require_any').array().notNull().default(sql`ARRAY[]::text[]`),
  kind: entityKind('kind').notNull(),
  color: text('color').notNull().default('#6b7280'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUnique: uniqueIndex('tracked_entities_slug_unique').on(t.slug),
}))

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: text('source_id').notNull().references(() => sources.id),
  url: text('url').notNull(),
  title: text('title').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  snippet: text('snippet'),
  fullText: text('full_text'),
  aiSummary: text('ai_summary'),
  matchedEntities: text('matched_entities').array().notNull().default(sql`ARRAY[]::text[]`),
  matchedKeywords: text('matched_keywords').array().notNull().default(sql`ARRAY[]::text[]`),
  enrichmentStatus: enrichmentStatus('enrichment_status').notNull().default('pending'),
  enrichmentError: text('enrichment_error'),
  enrichmentAttempts: integer('enrichment_attempts').notNull().default(0),
  falsePositive: boolean('false_positive').notNull().default(false),
  searchTsv: tsvector('search_tsv').generatedAlwaysAs(
    sql`to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(full_text,''))`
  ),
}, (t) => ({
  urlUnique: uniqueIndex('articles_url_unique').on(t.url),
  publishedIdx: index('articles_published_idx').on(t.publishedAt.desc()),
  matchedEntitiesIdx: index('articles_matched_entities_idx').using('gin', t.matchedEntities),
  searchTsvIdx: index('articles_search_tsv_idx').using('gin', t.searchTsv),
  enrichQueueIdx: index('articles_enrich_queue_idx').on(t.enrichmentStatus, t.discoveredAt),
}))

export const cronRuns = pgTable('cron_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: cronKind('kind').notNull(),
  sourceId: text('source_id').references(() => sources.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  articlesDiscovered: integer('articles_discovered').notNull().default(0),
  articlesEnriched: integer('articles_enriched').notNull().default(0),
  errors: jsonb('errors').notNull().default(sql`'[]'::jsonb`),
  status: cronStatus('status').notNull().default('ok'),
}, (t) => ({
  kindStartedIdx: index('cron_runs_kind_started_idx').on(t.kind, t.startedAt.desc()),
}))
