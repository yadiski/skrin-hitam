# Parti MUDA News Monitor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 16 app that polls Malaysian news RSS feeds every 15 min, detects coverage of Parti MUDA and tagged figures (Luqman Long), AI-summarizes matches, and displays them on a public dashboard with a password-gated admin page for dynamic keyword management.

**Architecture:** Monorepo Next.js 16 (App Router, RSC) on Vercel Pro. Two Vercel Crons (`poll` every 15 min, `enrich` every 5 min) write to Neon Postgres. Matching logic runs in Node; AI summaries via Claude Haiku with prompt caching. Admin page gated by middleware-checked HMAC cookie. Historical backfill runs as a local Node script.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind v4, shadcn/ui, Drizzle ORM, Neon Postgres, `rss-parser`, `@mozilla/readability`, `jsdom`, `@anthropic-ai/sdk`, Vitest, `p-limit`, `robots-parser`.

---

## File structure

```
muda-news-monitor/
├── .github/workflows/ci.yml
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                              # Home (public)
│   ├── article/[id]/page.tsx                 # Detail (public)
│   ├── admin/
│   │   ├── layout.tsx                        # Nav + logout
│   │   ├── login/page.tsx
│   │   ├── page.tsx                          # Admin home (overview)
│   │   ├── entities/page.tsx
│   │   ├── entities/actions.ts               # Server actions
│   │   ├── sources/page.tsx
│   │   ├── sources/actions.ts
│   │   ├── runs/page.tsx
│   │   └── backfill/page.tsx
│   └── api/
│       ├── cron/poll/route.ts
│       ├── cron/enrich/route.ts
│       ├── health/route.ts
│       └── admin/rematch/route.ts
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── queries.ts
│   ├── sources/
│   │   ├── index.ts                          # Registry of source defs
│   │   ├── malaysiakini.ts
│   │   ├── thestar.ts
│   │   ├── malaymail.ts
│   │   ├── fmt.ts
│   │   ├── beritaharian.ts
│   │   ├── harianmetro.ts
│   │   ├── sinarharian.ts
│   │   └── astroawani.ts
│   ├── canonical.ts
│   ├── matcher.ts
│   ├── extractor.ts
│   ├── summarizer.ts
│   ├── rss.ts
│   ├── auth.ts                               # Admin cookie signing
│   ├── alert.ts                              # Webhook alerts
│   └── types.ts
├── drizzle.config.ts
├── drizzle/migrations/
├── scripts/
│   └── backfill.ts
├── tests/
│   ├── unit/
│   │   ├── canonical.test.ts
│   │   ├── matcher.test.ts
│   │   ├── extractor.test.ts
│   │   └── summarizer.test.ts
│   ├── integration/
│   │   ├── poll.test.ts
│   │   ├── enrich.test.ts
│   │   └── rematch.test.ts
│   └── fixtures/
│       ├── rss/
│       └── html/
├── middleware.ts
├── vercel.json
├── vitest.config.ts
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`

- [ ] **Step 1: Initialize Next.js 16 project with TypeScript + Tailwind v4**

Run from `muda-news-monitor/` (the repo already exists from brainstorming):

```bash
cd /Users/yadiski/devSpace/payong-legam/muda-news-monitor
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --turbopack --yes
```

Expected: Creates `app/`, `package.json`, configs. If a `README.md` or `public/` is created, leave them.

- [ ] **Step 2: Verify Next.js 16 was installed**

Run:
```bash
cat package.json | grep -E '"next"|"react"'
```

Expected: `"next": "^16...` and `"react": "^19...`. If `next` is lower than 16, run `npm install next@latest react@latest react-dom@latest`.

- [ ] **Step 3: Add project dependencies**

Run:
```bash
npm install drizzle-orm @neondatabase/serverless @anthropic-ai/sdk rss-parser @mozilla/readability jsdom p-limit robots-parser dayjs clsx class-variance-authority zod
npm install -D drizzle-kit vitest @vitest/ui tsx @types/node @types/jsdom dotenv
```

Expected: `package.json` updated with all deps.

- [ ] **Step 4: Add npm scripts**

Modify `package.json` `scripts` field to:
```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "seed": "tsx scripts/seed.ts",
    "backfill": "tsx scripts/backfill.ts"
  }
}
```

- [ ] **Step 5: Create `.env.example`**

Create `.env.example`:
```
DATABASE_URL=postgres://user:pass@host/db
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_PASSWORD=change-me
ADMIN_COOKIE_SECRET=generate-with-openssl-rand-hex-32
CRON_SECRET=generate-a-random-string
ALERT_WEBHOOK_URL=
```

Also append to `.gitignore`:
```
.env
.env.local
.vercel
```

- [ ] **Step 6: Replace `app/page.tsx` and `app/layout.tsx` with minimal placeholders**

Replace `app/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-8">Loading monitor…</main>
}
```

Replace `app/layout.tsx`:
```tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MUDA News Monitor',
  description: 'Tracking Parti MUDA news coverage across Malaysian media.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 antialiased font-mono">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 7: Verify dev server boots**

Run:
```bash
npm run dev -- --port 3030 &
sleep 8
curl -sf http://localhost:3030 | head -c 200
kill %1
```

Expected: HTML output containing "Loading monitor…". If it errors, resolve before committing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 project with deps and scripts"
```

---

## Task 2: Vitest config + fixtures directory

**Files:**
- Create: `vitest.config.ts`, `tests/fixtures/.gitkeep`, `tests/unit/smoke.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import dotenv from 'dotenv'
dotenv.config({ path: '.env.test', override: false })
dotenv.config({ path: '.env', override: false })
```

- [ ] **Step 3: Write a smoke test to prove the harness works**

Create `tests/unit/smoke.test.ts`:
```ts
import { test, expect } from 'vitest'

test('vitest wired up', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 4: Run the smoke test**

Run:
```bash
npm test
```

Expected: `1 passed`.

- [ ] **Step 5: Create fixtures directory**

```bash
mkdir -p tests/fixtures/rss tests/fixtures/html
touch tests/fixtures/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add vitest config and smoke test"
```

---

## Task 3: Drizzle schema

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`

- [ ] **Step 1: Write `drizzle.config.ts`**

```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
})
```

- [ ] **Step 2: Write `lib/db/schema.ts`**

```ts
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
```

- [ ] **Step 3: Write `lib/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

export const db = drizzle(neon(url), { schema })
export { schema }
```

- [ ] **Step 4: Generate initial migration**

Run:
```bash
npx drizzle-kit generate
```

Expected: file like `drizzle/migrations/0000_*.sql` created. Check it into git.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add drizzle schema for sources, entities, articles, cron_runs"
```

---

## Task 4: Source registry and seed data

**Files:**
- Create: `lib/sources/index.ts`, `lib/sources/malaysiakini.ts`, `lib/types.ts`, `scripts/seed.ts`

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type Language = 'en' | 'ms'

export type SourceDefinition = {
  id: string
  name: string
  rssUrl: string
  baseUrl: string
  language: Language
  // Fallback selectors for Readability failures; optional.
  articleSelector?: string
}

export type TrackedEntityInput = {
  slug: string
  name: string
  keywords: string[]
  requireAny: string[]
  kind: 'scope' | 'tag'
  color: string
}
```

- [ ] **Step 2: Write `lib/sources/malaysiakini.ts`**

```ts
import type { SourceDefinition } from '@/lib/types'

export const malaysiakini: SourceDefinition = {
  id: 'malaysiakini',
  name: 'Malaysiakini',
  rssUrl: 'https://www.malaysiakini.com/en/news.rss',
  baseUrl: 'https://www.malaysiakini.com',
  language: 'en',
}
```

- [ ] **Step 3: Write `lib/sources/index.ts` with only malaysiakini for now**

```ts
import type { SourceDefinition } from '@/lib/types'
import { malaysiakini } from './malaysiakini'

export const SOURCES: SourceDefinition[] = [
  malaysiakini,
]

export function getSource(id: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.id === id)
}
```

- [ ] **Step 4: Write `scripts/seed.ts`**

```ts
import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import { SOURCES } from '@/lib/sources'
import type { TrackedEntityInput } from '@/lib/types'

const ENTITIES: TrackedEntityInput[] = [
  {
    slug: 'muda',
    name: 'Parti MUDA',
    keywords: ['muda', 'parti muda'],
    requireAny: [],
    kind: 'scope',
    color: '#f97316',
  },
  {
    slug: 'luqman-long',
    name: 'Luqman Long',
    keywords: ['luqman long', 'luqman bin long', 'lokman long'],
    requireAny: ['muda', 'parti muda'],
    kind: 'tag',
    color: '#3b82f6',
  },
]

async function main() {
  for (const s of SOURCES) {
    await db.insert(schema.sources).values({
      id: s.id, name: s.name, rssUrl: s.rssUrl, baseUrl: s.baseUrl, language: s.language,
    }).onConflictDoNothing()
  }
  for (const e of ENTITIES) {
    await db.insert(schema.trackedEntities).values(e).onConflictDoNothing({ target: schema.trackedEntities.slug })
  }
  console.log('Seed complete:', SOURCES.length, 'sources,', ENTITIES.length, 'entities')
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sources): add source registry, seed data, and malaysiakini definition"
```

Note: seed cannot be run until the user provides `DATABASE_URL`. We defer actual DB setup to Task 18 (admin integration testing) where it first becomes necessary.

---

## Task 5: `lib/canonical.ts` — URL canonicalization (TDD)

**Files:**
- Create: `lib/canonical.ts`, `tests/unit/canonical.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/canonical.test.ts`:
```ts
import { describe, test, expect } from 'vitest'
import { canonicalizeUrl } from '@/lib/canonical'

describe('canonicalizeUrl', () => {
  test('strips utm_* params', () => {
    expect(canonicalizeUrl('https://example.com/a?utm_source=x&id=1'))
      .toBe('https://example.com/a?id=1')
  })

  test('strips all utm params, keeping others', () => {
    expect(canonicalizeUrl('https://example.com/a?utm_source=x&utm_medium=y&keep=1'))
      .toBe('https://example.com/a?keep=1')
  })

  test('removes fragment', () => {
    expect(canonicalizeUrl('https://example.com/a#section'))
      .toBe('https://example.com/a')
  })

  test('normalizes trailing slash', () => {
    expect(canonicalizeUrl('https://example.com/a/'))
      .toBe('https://example.com/a')
  })

  test('keeps root trailing slash', () => {
    expect(canonicalizeUrl('https://example.com/'))
      .toBe('https://example.com/')
  })

  test('lowercases host', () => {
    expect(canonicalizeUrl('https://Example.COM/path'))
      .toBe('https://example.com/path')
  })

  test('strips fbclid and gclid', () => {
    expect(canonicalizeUrl('https://example.com/a?fbclid=x&gclid=y&z=1'))
      .toBe('https://example.com/a?z=1')
  })

  test('sorts query params for stable dedupe', () => {
    expect(canonicalizeUrl('https://example.com/a?b=2&a=1'))
      .toBe('https://example.com/a?a=1&b=2')
  })

  test('returns null for invalid url', () => {
    expect(canonicalizeUrl('not a url')).toBe(null)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

Run:
```bash
npm test -- canonical
```

Expected: FAIL with "Cannot find module '@/lib/canonical'".

- [ ] **Step 3: Implement `lib/canonical.ts`**

```ts
const TRACKING_PREFIXES = ['utm_']
const TRACKING_KEYS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', '_ga', 'yclid'])

export function canonicalizeUrl(raw: string): string | null {
  let url: URL
  try { url = new URL(raw) } catch { return null }

  url.hostname = url.hostname.toLowerCase()
  url.hash = ''

  const params = new URLSearchParams()
  // Sort for deterministic output
  const entries = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PREFIXES.some((p) => k.toLowerCase().startsWith(p)))
    .filter(([k]) => !TRACKING_KEYS.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  for (const [k, v] of entries) params.append(k, v)
  url.search = params.toString()

  // Strip trailing slash except for root
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }

  return url.toString()
}
```

- [ ] **Step 4: Run tests — expect pass**

Run:
```bash
npm test -- canonical
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(canonical): add URL canonicalization for dedupe"
```

---

## Task 6: `lib/matcher.ts` — keyword matching with context (TDD)

**Files:**
- Create: `lib/matcher.ts`, `tests/unit/matcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/matcher.test.ts`:
```ts
import { describe, test, expect } from 'vitest'
import { matchText, type MatcherEntity } from '@/lib/matcher'

const MUDA: MatcherEntity = {
  slug: 'muda',
  keywords: ['muda', 'parti muda'],
  requireAny: [],
  kind: 'scope',
}

const LUQMAN: MatcherEntity = {
  slug: 'luqman-long',
  keywords: ['luqman long', 'luqman bin long', 'lokman long'],
  requireAny: ['muda', 'parti muda'],
  kind: 'tag',
}

describe('matchText — scope matching', () => {
  test('matches MUDA on plain mention', () => {
    const r = matchText('Parti MUDA launches new policy', [MUDA])
    expect(r.scope).toEqual(['muda'])
    expect(r.matchedKeywords).toContain('parti muda')
  })

  test('does not match MUDA on unrelated word starting with muda', () => {
    const r = matchText('Mudah sekali untuk belajar', [MUDA])
    expect(r.scope).toEqual([])
  })

  test('case insensitive', () => {
    const r = matchText('MUDA press conference', [MUDA])
    expect(r.scope).toEqual(['muda'])
  })
})

describe('matchText — tag with require_any (context gate)', () => {
  test('tags Luqman when MUDA also mentioned', () => {
    const r = matchText('YB Luqman Long speaks at MUDA event', [MUDA, LUQMAN])
    expect(r.scope).toEqual(['muda'])
    expect(r.tag).toEqual(['luqman-long'])
  })

  test('does NOT tag Luqman if MUDA context missing', () => {
    const r = matchText('Luqman Long opens new restaurant', [MUDA, LUQMAN])
    expect(r.scope).toEqual([])
    expect(r.tag).toEqual([])
  })

  test('honorific Dato is stripped', () => {
    const r = matchText("Dato' Luqman Long attends Parti MUDA AGM", [MUDA, LUQMAN])
    expect(r.tag).toEqual(['luqman-long'])
  })

  test('skip-word tolerance: "Luqman bin Long" matches "Luqman Long"', () => {
    const r = matchText('Mohd Luqman bin Long addressed Parti MUDA', [MUDA, LUQMAN])
    expect(r.tag).toEqual(['luqman-long'])
  })

  test('Lokman Long typo variant', () => {
    const r = matchText('Lokman Long of MUDA disagrees', [MUDA, LUQMAN])
    expect(r.tag).toEqual(['luqman-long'])
  })

  test('different Luqman in MUDA article: no tag', () => {
    const r = matchText('Luqman bin Ahmad of MUDA to run for Selangor seat', [MUDA, LUQMAN])
    expect(r.scope).toEqual(['muda'])
    expect(r.tag).toEqual([])
  })
})

describe('matchText — utilities', () => {
  test('empty entities list returns empty result', () => {
    const r = matchText('anything', [])
    expect(r.scope).toEqual([])
    expect(r.tag).toEqual([])
  })

  test('normalizes whitespace', () => {
    const r = matchText('Parti   MUDA\n\nlaunches', [MUDA])
    expect(r.scope).toEqual(['muda'])
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

Run:
```bash
npm test -- matcher
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `lib/matcher.ts`**

```ts
export type MatcherEntity = {
  slug: string
  keywords: string[]
  requireAny: string[]
  kind: 'scope' | 'tag'
}

export type MatchResult = {
  scope: string[]
  tag: string[]
  matchedKeywords: string[]
}

const HONORIFICS = [
  "dato'", 'dato', 'datuk', 'datin', 'tan sri', 'puan sri',
  'yb', 'yab', 'ybhg', 'tuan', 'puan', 'encik', 'sdr', 'sdri',
]

function normalize(text: string): string {
  let t = text.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const h of HONORIFICS) {
    const re = new RegExp(`(^|\\s)${escapeRegex(h)}(?=\\s)`, 'g')
    t = t.replace(re, '$1')
  }
  return t.replace(/\s+/g, ' ').trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function keywordRegex(keyword: string): RegExp {
  const normalized = keyword.toLowerCase().trim()
  const tokens = normalized.split(/\s+/).map(escapeRegex)
  if (tokens.length === 1) {
    return new RegExp(`\\b${tokens[0]}\\b`, 'i')
  }
  // Multi-word: allow up to 3 word chars between tokens (e.g., "bin")
  // Requires a space/word boundary on each side of the filler group.
  const pattern = tokens.join('(?:\\s+\\w{1,5}){0,1}\\s+')
  return new RegExp(`\\b${pattern}\\b`, 'i')
}

function anyKeywordMatches(text: string, keywords: string[]): { hit: boolean; matchedKeyword?: string } {
  for (const k of keywords) {
    if (keywordRegex(k).test(text)) return { hit: true, matchedKeyword: k.toLowerCase() }
  }
  return { hit: false }
}

export function matchText(text: string, entities: MatcherEntity[]): MatchResult {
  const norm = normalize(text)
  const scope: string[] = []
  const tag: string[] = []
  const matchedKeywords = new Set<string>()

  for (const entity of entities) {
    const hits: string[] = []
    for (const k of entity.keywords) {
      if (keywordRegex(k).test(norm)) hits.push(k.toLowerCase())
    }
    if (hits.length === 0) continue

    if (entity.requireAny.length > 0) {
      const ctx = anyKeywordMatches(norm, entity.requireAny)
      if (!ctx.hit) continue
      if (ctx.matchedKeyword) matchedKeywords.add(ctx.matchedKeyword)
    }

    for (const h of hits) matchedKeywords.add(h)
    if (entity.kind === 'scope') scope.push(entity.slug)
    else tag.push(entity.slug)
  }

  return { scope, tag, matchedKeywords: [...matchedKeywords] }
}
```

- [ ] **Step 4: Run tests — expect pass**

Run:
```bash
npm test -- matcher
```

Expected: all tests pass. If the "skip-word tolerance" test fails, check the regex in `keywordRegex` — the filler group should be optional (`{0,1}`) so plain "Luqman Long" also matches.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(matcher): implement keyword + context matching with Malay honorific stripping"
```

---

## Task 7: `lib/rss.ts` — RSS fetching with conditional headers (TDD)

**Files:**
- Create: `lib/rss.ts`, `tests/fixtures/rss/malaysiakini-sample.xml`, `tests/unit/rss.test.ts`

- [ ] **Step 1: Save a fixture RSS file**

Create `tests/fixtures/rss/malaysiakini-sample.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Malaysiakini</title>
  <link>https://www.malaysiakini.com</link>
  <description>Malaysian news</description>
  <item>
    <title>Parti MUDA launches new election push</title>
    <link>https://www.malaysiakini.com/news/100001</link>
    <description>Parti MUDA today announced...</description>
    <pubDate>Mon, 20 Apr 2026 10:00:00 +0800</pubDate>
    <guid>https://www.malaysiakini.com/news/100001</guid>
  </item>
  <item>
    <title>Economy in focus</title>
    <link>https://www.malaysiakini.com/news/100002</link>
    <description>Unrelated article</description>
    <pubDate>Mon, 20 Apr 2026 09:00:00 +0800</pubDate>
    <guid>https://www.malaysiakini.com/news/100002</guid>
  </item>
</channel>
</rss>
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/rss.test.ts`:
```ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchFeed } from '@/lib/rss'

const sample = readFileSync(join(__dirname, '../fixtures/rss/malaysiakini-sample.xml'), 'utf8')

describe('fetchFeed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sample, {
      status: 200,
      headers: { 'content-type': 'application/rss+xml', 'last-modified': 'Mon, 20 Apr 2026 10:00:00 GMT' },
    })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  test('parses items from RSS xml', async () => {
    const result = await fetchFeed('https://example.com/feed.rss')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.items).toHaveLength(2)
    expect(result.items[0].title).toBe('Parti MUDA launches new election push')
    expect(result.items[0].url).toBe('https://www.malaysiakini.com/news/100001')
    expect(result.items[0].publishedAt).toBeInstanceOf(Date)
  })

  test('returns not_modified when server responds 304', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 304 })))
    const result = await fetchFeed('https://example.com/feed.rss', { ifModifiedSince: 'Mon, 20 Apr 2026 10:00:00 GMT' })
    expect(result.status).toBe('not_modified')
  })

  test('returns error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await fetchFeed('https://example.com/feed.rss')
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.error).toContain('ECONNREFUSED')
  })
})
```

- [ ] **Step 3: Run test — expect failure**

Run:
```bash
npm test -- rss
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/rss.ts`**

```ts
import Parser from 'rss-parser'

export type RssItem = {
  title: string
  url: string
  snippet: string
  publishedAt: Date | null
  guid?: string
}

export type FetchFeedResult =
  | { status: 'ok'; items: RssItem[]; lastModified?: string; etag?: string }
  | { status: 'not_modified' }
  | { status: 'error'; error: string }

const parser = new Parser({ timeout: 10_000 })
const USER_AGENT = 'MudaNewsMonitorBot/1.0 (+https://muda-news-monitor.vercel.app)'

export async function fetchFeed(
  url: string,
  opts: { ifModifiedSince?: string; etag?: string } = {},
): Promise<FetchFeedResult> {
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml;q=0.9' }
  if (opts.ifModifiedSince) headers['if-modified-since'] = opts.ifModifiedSince
  if (opts.etag) headers['if-none-match'] = opts.etag

  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) }
  }

  if (res.status === 304) return { status: 'not_modified' }
  if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` }

  const xml = await res.text()
  let parsed: Parser.Output<unknown>
  try {
    parsed = await parser.parseString(xml)
  } catch (e) {
    return { status: 'error', error: `Parse: ${e instanceof Error ? e.message : String(e)}` }
  }

  const items: RssItem[] = (parsed.items ?? []).map((i) => ({
    title: (i.title ?? '').trim(),
    url: (i.link ?? '').trim(),
    snippet: (i.contentSnippet ?? i.content ?? '').trim().slice(0, 500),
    publishedAt: i.isoDate ? new Date(i.isoDate) : (i.pubDate ? new Date(i.pubDate) : null),
    guid: i.guid,
  })).filter((i) => i.title && i.url)

  return {
    status: 'ok',
    items,
    lastModified: res.headers.get('last-modified') ?? undefined,
    etag: res.headers.get('etag') ?? undefined,
  }
}
```

- [ ] **Step 5: Run test — expect pass**

Run:
```bash
npm test -- rss
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(rss): add conditional RSS fetcher with if-modified-since support"
```

---

## Task 8: `lib/extractor.ts` — Readability-based body extraction (TDD)

**Files:**
- Create: `lib/extractor.ts`, `tests/fixtures/html/simple-article.html`, `tests/unit/extractor.test.ts`

- [ ] **Step 1: Save a fixture HTML file**

Create `tests/fixtures/html/simple-article.html`:
```html
<!DOCTYPE html>
<html><head><title>Parti MUDA policy speech</title></head>
<body>
  <header><nav>Home | News</nav></header>
  <article>
    <h1>Parti MUDA policy speech</h1>
    <p>YB Luqman Long today delivered a 30-minute policy address at the Parti MUDA congress.</p>
    <p>He emphasized youth empowerment and electoral reform, calling on supporters to unite.</p>
    <p>"We are building something that will last," he said, referring to party infrastructure.</p>
  </article>
  <footer>Copyright 2026</footer>
</body></html>
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/extractor.test.ts`:
```ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractArticle } from '@/lib/extractor'

const html = readFileSync(join(__dirname, '../fixtures/html/simple-article.html'), 'utf8')

describe('extractArticle', () => {
  test('extracts title and body text', () => {
    const result = extractArticle(html, 'https://example.com/a')
    expect(result.title).toContain('Parti MUDA policy speech')
    expect(result.text).toContain('Luqman Long')
    expect(result.text).toContain('youth empowerment')
  })

  test('returns null title/text for non-article HTML', () => {
    const stub = '<html><body><div>x</div></body></html>'
    const result = extractArticle(stub, 'https://example.com/a')
    expect(result.text.length).toBeLessThan(200)
  })
})
```

- [ ] **Step 3: Run test — expect failure**

Run:
```bash
npm test -- extractor
```

Expected: module-not-found FAIL.

- [ ] **Step 4: Implement `lib/extractor.ts`**

```ts
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export type ExtractResult = {
  title: string
  text: string
}

export function extractArticle(html: string, url: string): ExtractResult {
  try {
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article) return { title: '', text: '' }
    return {
      title: (article.title ?? '').trim(),
      text: (article.textContent ?? '').trim().replace(/\s+/g, ' '),
    }
  } catch {
    return { title: '', text: '' }
  }
}
```

- [ ] **Step 5: Run test — expect pass**

Run:
```bash
npm test -- extractor
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(extractor): add Readability-based article body extraction"
```

---

## Task 9: `lib/summarizer.ts` — Claude Haiku wrapper (TDD)

**Files:**
- Create: `lib/summarizer.ts`, `tests/unit/summarizer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/summarizer.test.ts`:
```ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { summarize } from '@/lib/summarizer'

const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
  },
}))

describe('summarize', () => {
  beforeEach(() => {
    createMock.mockReset()
    process.env.ANTHROPIC_API_KEY = 'test'
  })
  afterEach(() => { vi.restoreAllMocks() })

  test('returns summary text on success', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'A short summary.' }] })
    const s = await summarize({ title: 'Title', body: 'A long article body with enough content.'.repeat(20) })
    expect(s).toBe('A short summary.')
    expect(createMock).toHaveBeenCalled()
    const call = createMock.mock.calls[0][0]
    expect(call.model).toBe('claude-haiku-4-5-20251001')
    expect(call.system).toBeDefined()
    // Cache control on system prompt
    expect(Array.isArray(call.system) ? call.system[0].cache_control : call.system)
      .toBeTruthy()
  })

  test('returns null when body is too short', async () => {
    const s = await summarize({ title: 'T', body: 'short' })
    expect(s).toBe(null)
    expect(createMock).not.toHaveBeenCalled()
  })

  test('truncates body to 8000 chars in user message', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    await summarize({ title: 'T', body: 'x'.repeat(20_000) })
    const userContent = createMock.mock.calls[0][0].messages[0].content
    expect(userContent.length).toBeLessThanOrEqual(8000 + 'T'.length + 10)
  })

  test('throws on API error (caller decides retry)', async () => {
    createMock.mockRejectedValue(new Error('rate_limit'))
    await expect(summarize({ title: 'T', body: 'long body '.repeat(30) })).rejects.toThrow('rate_limit')
  })
})
```

- [ ] **Step 2: Run test — expect failure**

Run:
```bash
npm test -- summarizer
```

Expected: module-not-found.

- [ ] **Step 3: Implement `lib/summarizer.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_BODY = 8000
const MIN_BODY = 200

const SYSTEM_PROMPT = `You summarize Malaysian news articles in 2-3 sentences of neutral English.
Focus on: who did what, when, and key quotes if any. Avoid editorializing or adding information
not present in the article. If the article is written in Bahasa Malaysia, still summarize in English.`

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    client = new Anthropic({ apiKey })
  }
  return client
}

export async function summarize(input: { title: string; body: string }): Promise<string | null> {
  const body = (input.body ?? '').trim()
  if (body.length < MIN_BODY) return null
  const truncated = body.slice(0, MAX_BODY)
  const userContent = `${input.title}\n\n${truncated}`

  const msg = await getClient().messages.create({
    model: MODEL,
    max_tokens: 300,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  })

  const first = msg.content.find((b) => b.type === 'text')
  return first && first.type === 'text' ? first.text.trim() : null
}
```

- [ ] **Step 4: Run test — expect pass**

Run:
```bash
npm test -- summarizer
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(summarizer): add Claude Haiku wrapper with prompt caching and body min/max guards"
```

---

## Task 10: Poll cron route with integration test

**Files:**
- Create: `app/api/cron/poll/route.ts`, `lib/db/queries.ts`, `tests/integration/poll.test.ts`, `vercel.json`

Integration tests need a real Postgres. Use a dedicated Neon branch via `DATABASE_URL` in `.env.test`. If not available, tests will skip via a check.

- [ ] **Step 1: Add DB query helpers in `lib/db/queries.ts`**

```ts
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
  const result = await db.insert(schema.articles).values(rows).onConflictDoNothing({ target: schema.articles.url })
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
```

- [ ] **Step 2: Write the integration test (skipped if no DATABASE_URL)**

Create `tests/integration/poll.test.ts`:
```ts
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, schema } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

const hasDb = Boolean(process.env.DATABASE_URL)
const describeIfDb = hasDb ? describe : describe.skip

const SAMPLE_RSS = readFileSync(join(__dirname, '../fixtures/rss/malaysiakini-sample.xml'), 'utf8')

describeIfDb('POST /api/cron/poll integration', () => {
  beforeAll(async () => {
    await db.execute(sql`truncate table cron_runs, articles, tracked_entities, sources restart identity cascade`)
    await db.insert(schema.sources).values({
      id: 'malaysiakini', name: 'Malaysiakini',
      rssUrl: 'https://example.test/feed.rss', baseUrl: 'https://example.test', language: 'en',
    })
    await db.insert(schema.trackedEntities).values([
      { slug: 'muda', name: 'MUDA', keywords: ['muda','parti muda'], requireAny: [], kind: 'scope', color: '#f97316' },
      { slug: 'luqman-long', name: 'Luqman Long', keywords: ['luqman long'], requireAny: ['muda','parti muda'], kind: 'tag', color: '#3b82f6' },
    ])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE_RSS, {
      status: 200, headers: { 'content-type': 'application/rss+xml' },
    })))
  })
  afterAll(() => { vi.unstubAllGlobals() })

  test('inserts matching articles, skips unrelated ones', async () => {
    const { POST } = await import('@/app/api/cron/poll/route')
    const req = new Request('http://x/api/cron/poll', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}` },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const rows = await db.select().from(schema.articles)
    expect(rows).toHaveLength(1)
    expect(rows[0].matchedEntities).toContain('muda')
    expect(rows[0].title).toContain('Parti MUDA')
  })

  test('dedupes on second run', async () => {
    const { POST } = await import('@/app/api/cron/poll/route')
    const req = new Request('http://x/api/cron/poll', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}` },
    })
    await POST(req)
    const rows = await db.select().from(schema.articles)
    expect(rows).toHaveLength(1)  // still 1
  })
})
```

- [ ] **Step 3: Run test — expect failure**

Run:
```bash
npm test -- poll
```

Expected: FAIL (module not found) if DATABASE_URL is set; SKIPPED otherwise. Either way, proceed.

- [ ] **Step 4: Implement `app/api/cron/poll/route.ts`**

```ts
import { NextResponse } from 'next/server'
import pLimit from 'p-limit'
import { SOURCES } from '@/lib/sources'
import { fetchFeed } from '@/lib/rss'
import { canonicalizeUrl } from '@/lib/canonical'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import {
  getEnabledSources, getEnabledEntities,
  findExistingUrls, insertArticles, recordCronRun,
  type NewArticleInput,
} from '@/lib/db/queries'

export const runtime = 'nodejs'
export const maxDuration = 60

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runPoll()
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runPoll()
}

async function runPoll() {
  const [sourcesDb, entitiesDb] = await Promise.all([getEnabledSources(), getEnabledEntities()])
  const matcherEntities: MatcherEntity[] = entitiesDb.map((e) => ({
    slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind,
  }))

  const limit = pLimit(4)
  const results = await Promise.all(sourcesDb.map((s) => limit(async () => {
    const def = SOURCES.find((d) => d.id === s.id)
    const rssUrl = def?.rssUrl ?? s.rssUrl
    const feed = await fetchFeed(rssUrl)
    if (feed.status !== 'ok') {
      await recordCronRun({ kind: 'poll', sourceId: s.id, status: 'failed', errors: [{ stage: 'fetch', error: feed.status === 'error' ? feed.error : 'not_modified' }] })
      return { sourceId: s.id, inserted: 0 }
    }

    const candidates: NewArticleInput[] = []
    for (const item of feed.items) {
      const url = canonicalizeUrl(item.url)
      if (!url) continue
      const result = matchText(`${item.title}\n${item.snippet}`, matcherEntities)
      if (result.scope.length === 0) continue
      candidates.push({
        sourceId: s.id, url, title: item.title,
        publishedAt: item.publishedAt, snippet: item.snippet,
        matchedEntities: [...result.scope, ...result.tag],
        matchedKeywords: result.matchedKeywords,
      })
    }

    const existing = await findExistingUrls(candidates.map((c) => c.url))
    const fresh = candidates.filter((c) => !existing.has(c.url))
    const inserted = await insertArticles(fresh)
    await recordCronRun({ kind: 'poll', sourceId: s.id, status: 'ok', articlesDiscovered: inserted })
    return { sourceId: s.id, inserted }
  })))

  return NextResponse.json({ ok: true, sources: results })
}
```

- [ ] **Step 5: Run test — expect pass (if DB available)**

Run:
```bash
npm test -- poll
```

Expected: pass or skip.

- [ ] **Step 6: Add `vercel.json` cron config**

Create `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/poll", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/enrich", "schedule": "*/5 * * * *" }
  ]
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cron): implement poll cron with per-source isolation and dedup"
```

---

## Task 11: Enrich cron route with integration test

**Files:**
- Create: `app/api/cron/enrich/route.ts`, `tests/integration/enrich.test.ts`

- [ ] **Step 1: Extend `lib/db/queries.ts` with enrich helpers**

Append to `lib/db/queries.ts`:
```ts
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
```

- [ ] **Step 2: Write integration test**

Create `tests/integration/enrich.test.ts`:
```ts
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'

const hasDb = Boolean(process.env.DATABASE_URL)
const describeIfDb = hasDb ? describe : describe.skip

const ARTICLE_HTML = readFileSync(join(__dirname, '../fixtures/html/simple-article.html'), 'utf8')

vi.mock('@/lib/summarizer', () => ({
  summarize: vi.fn(async () => 'MUDA leader Luqman Long made a speech about youth empowerment.'),
}))

describeIfDb('POST /api/cron/enrich integration', () => {
  let articleId: string

  beforeAll(async () => {
    await db.execute(sql`truncate table cron_runs, articles, tracked_entities, sources restart identity cascade`)
    await db.insert(schema.sources).values({
      id: 'malaysiakini', name: 'Malaysiakini',
      rssUrl: 'https://example.test/feed.rss', baseUrl: 'https://example.test', language: 'en',
    })
    await db.insert(schema.trackedEntities).values([
      { slug: 'muda', name: 'MUDA', keywords: ['muda','parti muda'], requireAny: [], kind: 'scope', color: '#f97316' },
      { slug: 'luqman-long', name: 'Luqman Long', keywords: ['luqman long'], requireAny: ['muda','parti muda'], kind: 'tag', color: '#3b82f6' },
    ])
    const inserted = await db.insert(schema.articles).values({
      sourceId: 'malaysiakini',
      url: 'https://example.test/article-1',
      title: 'Parti MUDA policy speech',
      snippet: 'YB Luqman Long spoke...',
      matchedEntities: ['muda'],
      matchedKeywords: ['parti muda'],
    }).returning({ id: schema.articles.id })
    articleId = inserted[0].id

    vi.stubGlobal('fetch', vi.fn(async () => new Response(ARTICLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } })))
  })
  afterAll(() => { vi.unstubAllGlobals() })

  test('enriches pending article and adds tag', async () => {
    const { POST } = await import('@/app/api/cron/enrich/route')
    const req = new Request('http://x', {
      method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}` },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const row = await db.select().from(schema.articles).where(eq(schema.articles.id, articleId))
    expect(row[0].enrichmentStatus).toBe('done')
    expect(row[0].fullText).toContain('youth empowerment')
    expect(row[0].aiSummary).toContain('youth empowerment')
    expect(row[0].matchedEntities).toContain('luqman-long')
  })
})
```

- [ ] **Step 3: Run test — expect failure**

Run:
```bash
npm test -- enrich
```

Expected: module-not-found.

- [ ] **Step 4: Implement `app/api/cron/enrich/route.ts`**

```ts
import { NextResponse } from 'next/server'
import pLimit from 'p-limit'
import { extractArticle } from '@/lib/extractor'
import { summarize } from '@/lib/summarizer'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import {
  getPendingArticles, getEnabledEntities,
  updateArticleEnriched, bumpArticleFailure, recordCronRun,
} from '@/lib/db/queries'

export const runtime = 'nodejs'
export const maxDuration = 800

const USER_AGENT = 'MudaNewsMonitorBot/1.0 (+https://muda-news-monitor.vercel.app)'

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runEnrich()
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return runEnrich()
}

async function runEnrich() {
  const [pending, entitiesDb] = await Promise.all([getPendingArticles(20), getEnabledEntities()])
  const entities: MatcherEntity[] = entitiesDb.map((e) => ({
    slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind,
  }))

  let enriched = 0
  const errors: { id: string; error: string }[] = []
  const limit = pLimit(3)

  await Promise.all(pending.map((a) => limit(async () => {
    try {
      const res = await fetch(a.url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const { text } = extractArticle(html, a.url)
      if (!text || text.length < 200) {
        await updateArticleEnriched(a.id, {
          fullText: text, aiSummary: null,
          matchedEntities: a.matchedEntities, matchedKeywords: a.matchedKeywords,
        })
        enriched++
        return
      }
      const rematch = matchText(`${a.title}\n${text}`, entities)
      const combinedEntities = rematch.scope.length > 0 ? [...rematch.scope, ...rematch.tag] : a.matchedEntities
      const summary = await summarize({ title: a.title, body: text })
      await updateArticleEnriched(a.id, {
        fullText: text, aiSummary: summary,
        matchedEntities: combinedEntities,
        matchedKeywords: rematch.matchedKeywords.length ? rematch.matchedKeywords : a.matchedKeywords,
      })
      enriched++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push({ id: a.id, error: msg })
      await bumpArticleFailure(a.id, msg)
    }
  })))

  await recordCronRun({
    kind: 'enrich',
    articlesEnriched: enriched,
    errors,
    status: errors.length === 0 ? 'ok' : (enriched > 0 ? 'partial' : 'failed'),
  })

  return NextResponse.json({ ok: true, enriched, errors: errors.length })
}
```

- [ ] **Step 5: Run test — expect pass (if DB available)**

Run:
```bash
npm test -- enrich
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(cron): implement enrich cron with rematch, summary, and failure ladder"
```

---

## Task 12: Remaining source definitions

**Files:**
- Create: `lib/sources/thestar.ts`, `lib/sources/malaymail.ts`, `lib/sources/fmt.ts`, `lib/sources/beritaharian.ts`, `lib/sources/harianmetro.ts`, `lib/sources/sinarharian.ts`, `lib/sources/astroawani.ts`
- Modify: `lib/sources/index.ts`

- [ ] **Step 1: Create each source file**

Create `lib/sources/thestar.ts`:
```ts
import type { SourceDefinition } from '@/lib/types'
export const thestar: SourceDefinition = {
  id: 'thestar', name: 'The Star',
  rssUrl: 'https://www.thestar.com.my/rss/News/Nation',
  baseUrl: 'https://www.thestar.com.my', language: 'en',
}
```

Create `lib/sources/malaymail.ts`:
```ts
import type { SourceDefinition } from '@/lib/types'
export const malaymail: SourceDefinition = {
  id: 'malaymail', name: 'Malay Mail',
  rssUrl: 'https://www.malaymail.com/feed/rss/malaysia',
  baseUrl: 'https://www.malaymail.com', language: 'en',
}
```

Create `lib/sources/fmt.ts`:
```ts
import type { SourceDefinition } from '@/lib/types'
export const fmt: SourceDefinition = {
  id: 'fmt', name: 'Free Malaysia Today',
  rssUrl: 'https://www.freemalaysiatoday.com/category/nation/feed/',
  baseUrl: 'https://www.freemalaysiatoday.com', language: 'en',
}
```

Create `lib/sources/beritaharian.ts`:
```ts
import type { SourceDefinition } from '@/lib/types'
export const beritaharian: SourceDefinition = {
  id: 'beritaharian', name: 'Berita Harian',
  rssUrl: 'https://www.bharian.com.my/rss/berita/nasional',
  baseUrl: 'https://www.bharian.com.my', language: 'ms',
}
```

Create `lib/sources/harianmetro.ts`:
```ts
import type { SourceDefinition } from '@/lib/types'
export const harianmetro: SourceDefinition = {
  id: 'harianmetro', name: 'Harian Metro',
  rssUrl: 'https://www.hmetro.com.my/rss/mutakhir',
  baseUrl: 'https://www.hmetro.com.my', language: 'ms',
}
```

Create `lib/sources/sinarharian.ts`:
```ts
import type { SourceDefinition } from '@/lib/types'
export const sinarharian: SourceDefinition = {
  id: 'sinarharian', name: 'Sinar Harian',
  rssUrl: 'https://www.sinarharian.com.my/rssfeed/nasional',
  baseUrl: 'https://www.sinarharian.com.my', language: 'ms',
}
```

Create `lib/sources/astroawani.ts`:
```ts
import type { SourceDefinition } from '@/lib/types'
export const astroawani: SourceDefinition = {
  id: 'astroawani', name: 'Astro Awani',
  rssUrl: 'https://www.astroawani.com/rss.xml',
  baseUrl: 'https://www.astroawani.com', language: 'ms',
}
```

- [ ] **Step 2: Update `lib/sources/index.ts`**

```ts
import type { SourceDefinition } from '@/lib/types'
import { malaysiakini } from './malaysiakini'
import { thestar } from './thestar'
import { malaymail } from './malaymail'
import { fmt } from './fmt'
import { beritaharian } from './beritaharian'
import { harianmetro } from './harianmetro'
import { sinarharian } from './sinarharian'
import { astroawani } from './astroawani'

export const SOURCES: SourceDefinition[] = [
  malaysiakini, thestar, malaymail, fmt,
  beritaharian, harianmetro, sinarharian, astroawani,
]

export function getSource(id: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.id === id)
}
```

- [ ] **Step 3: Update seed script to include all sources**

The existing seed iterates `SOURCES` so no code change is needed — re-running seeds the 7 new ones via `onConflictDoNothing`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(sources): add remaining 7 Malaysian news source definitions"
```

Note: RSS URLs are best-effort from documented patterns. If any feed returns 404 in production, the admin can edit `sources.rss_url` from the admin UI (Task 16) without code deploy.

---

## Task 13: Admin auth (middleware + cookie signing)

**Files:**
- Create: `lib/auth.ts`, `middleware.ts`, `app/admin/login/page.tsx`, `app/admin/login/actions.ts`, `app/admin/layout.tsx`, `app/admin/page.tsx`, `tests/unit/auth.test.ts`

- [ ] **Step 1: Write the failing tests for auth**

Create `tests/unit/auth.test.ts`:
```ts
import { describe, test, expect, beforeEach } from 'vitest'
import { signToken, verifyToken } from '@/lib/auth'

beforeEach(() => { process.env.ADMIN_COOKIE_SECRET = 'a'.repeat(32) })

describe('auth', () => {
  test('signs and verifies a token', async () => {
    const token = await signToken('admin')
    expect(await verifyToken(token)).toBe('admin')
  })

  test('rejects tampered token', async () => {
    const token = await signToken('admin')
    const tampered = token.slice(0, -4) + 'xxxx'
    expect(await verifyToken(tampered)).toBe(null)
  })

  test('rejects expired token', async () => {
    const token = await signToken('admin', -60)  // -60s expiry
    expect(await verifyToken(token)).toBe(null)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

Run:
```bash
npm test -- auth
```

Expected: module-not-found.

- [ ] **Step 3: Implement `lib/auth.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7  // 7 days
const ALGO = 'sha256'

function getSecret(): Buffer {
  const s = process.env.ADMIN_COOKIE_SECRET
  if (!s || s.length < 32) throw new Error('ADMIN_COOKIE_SECRET must be at least 32 chars')
  return Buffer.from(s, 'utf8')
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function fromBase64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export async function signToken(subject: string, ttlSec = DEFAULT_TTL_SEC): Promise<string> {
  const payload = { sub: subject, exp: Math.floor(Date.now() / 1000) + ttlSec }
  const body = base64url(Buffer.from(JSON.stringify(payload)))
  const sig = createHmac(ALGO, getSecret()).update(body).digest()
  return `${body}.${base64url(sig)}`
}

export async function verifyToken(token: string): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = createHmac(ALGO, getSecret()).update(body).digest()
  const given = fromBase64url(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: { sub: string; exp: number }
  try { payload = JSON.parse(fromBase64url(body).toString('utf8')) } catch { return null }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload.sub
}

export function verifyPassword(provided: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? ''
  if (!expected) return false
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const ADMIN_COOKIE_NAME = 'muda_admin'
```

- [ ] **Step 4: Run tests — expect pass**

Run:
```bash
npm test -- auth
```

Expected: 3 tests pass.

- [ ] **Step 5: Implement `middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, ADMIN_COOKIE_NAME } from '@/lib/auth'

export const config = {
  matcher: ['/admin/:path*'],
}

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/admin/login') return NextResponse.next()
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.redirect(new URL('/admin/login', req.url))
  const sub = await verifyToken(cookie)
  if (!sub) return NextResponse.redirect(new URL('/admin/login', req.url))
  return NextResponse.next()
}
```

- [ ] **Step 6: Create login page and server action**

Create `app/admin/login/actions.ts`:
```ts
'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signToken, verifyPassword, ADMIN_COOKIE_NAME } from '@/lib/auth'

export async function loginAction(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (!verifyPassword(password)) {
    redirect('/admin/login?error=1')
  }
  const token = await signToken('admin')
  const cookieStore = await cookies()
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  redirect('/admin')
}

export async function logoutAction() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
  redirect('/admin/login')
}
```

Create `app/admin/login/page.tsx`:
```tsx
import { loginAction } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form action={loginAction} className="w-full max-w-sm space-y-4 border border-neutral-800 rounded-lg p-6">
        <h1 className="text-lg">Admin login</h1>
        <input name="password" type="password" autoComplete="current-password" required
          className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2" placeholder="Password" />
        {error && <p className="text-sm text-red-400">Invalid password.</p>}
        <button type="submit" className="w-full bg-orange-500 text-black rounded px-3 py-2 font-semibold">Sign in</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 7: Create admin shell**

Create `app/admin/layout.tsx`:
```tsx
import Link from 'next/link'
import { logoutAction } from './login/actions'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center gap-4">
        <span className="font-semibold">Admin</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin">Overview</Link>
          <Link href="/admin/entities">Entities</Link>
          <Link href="/admin/sources">Sources</Link>
          <Link href="/admin/runs">Runs</Link>
          <Link href="/admin/backfill">Backfill</Link>
        </nav>
        <form action={logoutAction} className="ml-auto">
          <button type="submit" className="text-sm text-neutral-400 hover:text-white">Log out</button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

Create `app/admin/page.tsx`:
```tsx
import { db, schema } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export default async function AdminHome() {
  const [{ count: articles }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from articles`)
  const [{ count: pending }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from articles where enrichment_status = 'pending'`)
  const [{ count: failed }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from articles where enrichment_status = 'failed'`)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Articles" value={articles} />
        <Stat label="Pending enrichment" value={pending} />
        <Stat label="Failed enrichment" value={failed} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-neutral-800 rounded-lg p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin): add HMAC cookie auth, middleware, login page, and admin shell"
```

---

## Task 14: Admin entities CRUD

**Files:**
- Create: `app/admin/entities/page.tsx`, `app/admin/entities/actions.ts`, `app/api/admin/rematch/route.ts`, `tests/integration/rematch.test.ts`

- [ ] **Step 1: Write entities page (server component with form actions)**

Create `app/admin/entities/page.tsx`:
```tsx
import { db, schema } from '@/lib/db/client'
import { asc } from 'drizzle-orm'
import { saveEntity, deleteEntity, triggerRematch } from './actions'

export default async function EntitiesPage() {
  const entities = await db.select().from(schema.trackedEntities).orderBy(asc(schema.trackedEntities.slug))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tracked entities</h1>
        <form action={triggerRematch}>
          <button type="submit" className="text-sm border border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-800">
            Re-match all articles
          </button>
        </form>
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="text-left px-3 py-2">Slug</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Kind</th>
              <th className="text-left px-3 py-2">Keywords</th>
              <th className="text-left px-3 py-2">Require any</th>
              <th className="text-left px-3 py-2">Enabled</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 font-mono text-xs">{e.slug}</td>
                <td className="px-3 py-2">
                  <form action={saveEntity} className="contents">
                    <input type="hidden" name="id" value={e.id} />
                    <input name="name" defaultValue={e.name} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full" />
                </form>
                </td>
                <td className="px-3 py-2">{e.kind}</td>
                <td className="px-3 py-2">
                  <form action={saveEntity} className="contents">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="field" value="keywords" />
                    <input name="keywords" defaultValue={e.keywords.join(', ')} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full" />
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={saveEntity} className="contents">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="field" value="requireAny" />
                    <input name="requireAny" defaultValue={e.requireAny.join(', ')} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full" />
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={saveEntity}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="field" value="enabled" />
                    <input name="enabled" type="checkbox" defaultChecked={e.enabled} />
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={deleteEntity}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="text-red-400 hover:text-red-300">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewEntityForm />
    </div>
  )
}

function NewEntityForm() {
  return (
    <form action={saveEntity} className="border border-neutral-800 rounded-lg p-4 space-y-3 max-w-xl">
      <h2 className="font-semibold">New entity</h2>
      <input name="slug" placeholder="slug (e.g., syed-saddiq)" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" required />
      <input name="name" placeholder="Display name" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" required />
      <select name="kind" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1">
        <option value="tag">tag (label on scoped articles)</option>
        <option value="scope">scope (extends the DB corpus)</option>
      </select>
      <input name="keywords" placeholder="keywords, comma-separated" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" required />
      <input name="requireAny" placeholder="require-any, comma-separated (optional)" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" />
      <input name="color" defaultValue="#3b82f6" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" />
      <button type="submit" className="bg-orange-500 text-black rounded px-3 py-1.5 font-semibold">Create</button>
    </form>
  )
}
```

- [ ] **Step 2: Write `app/admin/entities/actions.ts`**

```ts
'use server'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { runRematchAllArticles } from '@/app/api/admin/rematch/route'

function parseList(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

export async function saveEntity(formData: FormData) {
  const id = formData.get('id') as string | null
  const field = formData.get('field') as string | null

  if (!id) {
    await db.insert(schema.trackedEntities).values({
      slug: String(formData.get('slug')).toLowerCase().trim(),
      name: String(formData.get('name')).trim(),
      kind: (formData.get('kind') as 'scope' | 'tag') ?? 'tag',
      keywords: parseList(formData.get('keywords')),
      requireAny: parseList(formData.get('requireAny')),
      color: String(formData.get('color') ?? '#3b82f6'),
    })
  } else if (field === 'keywords') {
    await db.update(schema.trackedEntities).set({ keywords: parseList(formData.get('keywords')), updatedAt: new Date() }).where(eq(schema.trackedEntities.id, id))
  } else if (field === 'requireAny') {
    await db.update(schema.trackedEntities).set({ requireAny: parseList(formData.get('requireAny')), updatedAt: new Date() }).where(eq(schema.trackedEntities.id, id))
  } else if (field === 'enabled') {
    await db.update(schema.trackedEntities).set({ enabled: formData.get('enabled') === 'on', updatedAt: new Date() }).where(eq(schema.trackedEntities.id, id))
  } else {
    await db.update(schema.trackedEntities).set({ name: String(formData.get('name')).trim(), updatedAt: new Date() }).where(eq(schema.trackedEntities.id, id))
  }

  revalidatePath('/admin/entities')
}

export async function deleteEntity(formData: FormData) {
  const id = String(formData.get('id'))
  await db.delete(schema.trackedEntities).where(eq(schema.trackedEntities.id, id))
  revalidatePath('/admin/entities')
}

export async function triggerRematch() {
  await runRematchAllArticles()
  revalidatePath('/admin/entities')
  revalidatePath('/')
}
```

- [ ] **Step 3: Write `app/api/admin/rematch/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST() {
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
```

- [ ] **Step 4: Write integration test for rematch**

Create `tests/integration/rematch.test.ts`:
```ts
import { describe, test, expect, beforeEach } from 'vitest'
import { db, schema } from '@/lib/db/client'
import { sql, eq } from 'drizzle-orm'

const hasDb = Boolean(process.env.DATABASE_URL)
const describeIfDb = hasDb ? describe : describe.skip

describeIfDb('runRematchAllArticles', () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table cron_runs, articles, tracked_entities, sources restart identity cascade`)
    await db.insert(schema.sources).values({
      id: 'x', name: 'X', rssUrl: 'http://x', baseUrl: 'http://x', language: 'en',
    })
    await db.insert(schema.articles).values({
      sourceId: 'x',
      url: 'http://x/1',
      title: 'Parti MUDA event',
      fullText: 'Parti MUDA held a rally. YB Luqman Long spoke.',
      matchedEntities: [],
      matchedKeywords: [],
    })
  })

  test('applies new entity to existing article', async () => {
    await db.insert(schema.trackedEntities).values([
      { slug: 'muda', name: 'MUDA', keywords: ['muda','parti muda'], requireAny: [], kind: 'scope', color: '#f97316' },
      { slug: 'luqman-long', name: 'Luqman Long', keywords: ['luqman long'], requireAny: ['muda'], kind: 'tag', color: '#3b82f6' },
    ])
    const { runRematchAllArticles } = await import('@/app/api/admin/rematch/route')
    await runRematchAllArticles()

    const rows = await db.select().from(schema.articles).where(eq(schema.articles.url, 'http://x/1'))
    expect(rows[0].matchedEntities.sort()).toEqual(['luqman-long', 'muda'])
  })
})
```

- [ ] **Step 5: Run tests**

Run:
```bash
npm test
```

Expected: all passes or DB-integration skips.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(admin): add entities CRUD and re-match endpoint"
```

---

## Task 15: Admin sources page

**Files:**
- Create: `app/admin/sources/page.tsx`, `app/admin/sources/actions.ts`

- [ ] **Step 1: Implement `app/admin/sources/actions.ts`**

```ts
'use server'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function updateSource(formData: FormData) {
  const id = String(formData.get('id'))
  const field = String(formData.get('field'))
  if (field === 'enabled') {
    await db.update(schema.sources).set({ enabled: formData.get('enabled') === 'on', updatedAt: new Date() }).where(eq(schema.sources.id, id))
  } else if (field === 'rssUrl') {
    await db.update(schema.sources).set({ rssUrl: String(formData.get('rssUrl')), updatedAt: new Date() }).where(eq(schema.sources.id, id))
  }
  revalidatePath('/admin/sources')
}
```

- [ ] **Step 2: Implement `app/admin/sources/page.tsx`**

```tsx
import { db, schema } from '@/lib/db/client'
import { asc, desc, eq, and, sql } from 'drizzle-orm'
import { updateSource } from './actions'

export default async function SourcesPage() {
  const sources = await db.select().from(schema.sources).orderBy(asc(schema.sources.id))
  const lastRuns = await db.execute<{ source_id: string; started_at: string; status: string; errors_count: number }>(sql`
    select distinct on (source_id) source_id, started_at::text, status, coalesce(jsonb_array_length(errors), 0) as errors_count
    from cron_runs where kind = 'poll' and source_id is not null
    order by source_id, started_at desc
  `)
  const runBySource = new Map(lastRuns.map((r) => [r.source_id, r]))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Sources</h1>
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Enabled</th>
              <th className="text-left px-3 py-2">RSS URL</th>
              <th className="text-left px-3 py-2">Last poll</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const last = runBySource.get(s.id)
              return (
                <tr key={s.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 font-mono text-xs">{s.id}</td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">
                    <form action={updateSource}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="field" value="enabled" />
                      <input name="enabled" type="checkbox" defaultChecked={s.enabled} />
                    </form>
                  </td>
                  <td className="px-3 py-2">
                    <form action={updateSource} className="contents">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="field" value="rssUrl" />
                      <input name="rssUrl" defaultValue={s.rssUrl} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full" />
                    </form>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {last ? <>{last.status} · {new Date(last.started_at).toISOString()} · {last.errors_count} errs</> : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(admin): add sources page with enable toggle and last-poll status"
```

---

## Task 16: Admin runs page

**Files:**
- Create: `app/admin/runs/page.tsx`

- [ ] **Step 1: Implement**

Create `app/admin/runs/page.tsx`:
```tsx
import { db, schema } from '@/lib/db/client'
import { desc } from 'drizzle-orm'

export default async function RunsPage() {
  const runs = await db.select().from(schema.cronRuns).orderBy(desc(schema.cronRuns.startedAt)).limit(50)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Recent cron runs</h1>
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="text-left px-3 py-2">Started</th>
              <th className="text-left px-3 py-2">Kind</th>
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Discovered</th>
              <th className="text-left px-3 py-2">Enriched</th>
              <th className="text-left px-3 py-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 text-xs">{r.startedAt.toISOString()}</td>
                <td className="px-3 py-2">{r.kind}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.sourceId ?? '—'}</td>
                <td className={`px-3 py-2 ${statusColor(r.status)}`}>{r.status}</td>
                <td className="px-3 py-2">{r.articlesDiscovered}</td>
                <td className="px-3 py-2">{r.articlesEnriched}</td>
                <td className="px-3 py-2 text-xs">
                  {Array.isArray(r.errors) && (r.errors as unknown[]).length > 0
                    ? JSON.stringify(r.errors).slice(0, 200) + '…'
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function statusColor(status: string) {
  if (status === 'ok') return 'text-emerald-400'
  if (status === 'partial') return 'text-yellow-400'
  return 'text-red-400'
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(admin): add cron runs history page"
```

---

## Task 17: Public dashboard — home page with filters

**Files:**
- Modify: `app/page.tsx`
- Create: `app/_components/article-card.tsx`, `app/_components/filter-bar.tsx`

- [ ] **Step 1: Write `app/_components/article-card.tsx`**

```tsx
import Link from 'next/link'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)

type ArticleCardProps = {
  id: string
  sourceId: string
  sourceName: string
  sourceColor?: string
  url: string
  title: string
  publishedAt: Date | null
  aiSummary: string | null
  snippet: string | null
  matchedEntities: string[]
  enrichmentStatus: 'pending' | 'done' | 'failed'
  entityColors: Record<string, string>
  entityNames: Record<string, string>
}

export function ArticleCard(p: ArticleCardProps) {
  return (
    <article className="border border-neutral-800 rounded-lg p-4 space-y-3 hover:border-neutral-700">
      <div className="flex items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">{p.sourceName}</span>
        <span className="text-neutral-500">{p.publishedAt ? dayjs(p.publishedAt).fromNow() : 'unknown'}</span>
      </div>
      <h2 className="text-lg font-semibold leading-tight">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.title}</a>
      </h2>
      {p.enrichmentStatus === 'done' && p.aiSummary ? (
        <p className="text-neutral-300">{p.aiSummary}</p>
      ) : p.enrichmentStatus === 'pending' ? (
        <p className="text-neutral-500 italic">Summary pending…</p>
      ) : p.snippet ? (
        <p className="text-neutral-400 italic">{p.snippet}</p>
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        {p.matchedEntities.map((slug) => (
          <span key={slug} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${p.entityColors[slug] ?? '#6b7280'}33`, color: p.entityColors[slug] ?? '#6b7280' }}>
            {p.entityNames[slug] ?? slug}
          </span>
        ))}
        <Link href={`/article/${p.id}`} className="ml-auto text-xs text-neutral-500 hover:text-neutral-300">Details →</Link>
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Write `app/_components/filter-bar.tsx`**

```tsx
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
```

- [ ] **Step 3: Rewrite `app/page.tsx`**

```tsx
import { db, schema } from '@/lib/db/client'
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { ArticleCard } from './_components/article-card'
import { FilterBar } from './_components/filter-bar'

type Search = { entity?: string; source?: string; q?: string; page?: string }

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const pageSize = 25

  const conditions: SQL[] = [eq(schema.articles.falsePositive, false)]
  if (params.entity) conditions.push(sql`${schema.articles.matchedEntities} @> ARRAY[${params.entity}]::text[]`)
  if (params.source) conditions.push(eq(schema.articles.sourceId, params.source))
  if (params.q) conditions.push(sql`${schema.articles.searchTsv} @@ plainto_tsquery('simple', ${params.q})`)

  const [articles, entities, sources] = await Promise.all([
    db.select().from(schema.articles).where(and(...conditions)).orderBy(desc(schema.articles.publishedAt), desc(schema.articles.discoveredAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true)),
    db.select().from(schema.sources).where(eq(schema.sources.enabled, true)),
  ])

  const sourceMap = new Map(sources.map((s) => [s.id, s]))
  const entityColors = Object.fromEntries(entities.map((e) => [e.slug, e.color]))
  const entityNames = Object.fromEntries(entities.map((e) => [e.slug, e.name]))

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">MUDA News Monitor</h1>
        <p className="text-neutral-400 text-sm mt-1">Tracking Parti MUDA coverage across Malaysian media.</p>
      </header>
      <FilterBar
        entities={entities.map((e) => ({ slug: e.slug, name: e.name, color: e.color }))}
        sources={sources.map((s) => ({ id: s.id, name: s.name }))}
      />
      {articles.length === 0 ? (
        <p className="text-neutral-500">No articles match your filters yet.</p>
      ) : (
        <div className="space-y-4">
          {articles.map((a) => (
            <ArticleCard
              key={a.id}
              id={a.id}
              sourceId={a.sourceId}
              sourceName={sourceMap.get(a.sourceId)?.name ?? a.sourceId}
              url={a.url}
              title={a.title}
              publishedAt={a.publishedAt}
              aiSummary={a.aiSummary}
              snippet={a.snippet}
              matchedEntities={a.matchedEntities}
              enrichmentStatus={a.enrichmentStatus}
              entityColors={entityColors}
              entityNames={entityNames}
            />
          ))}
        </div>
      )}
      <Pagination page={page} hasMore={articles.length === pageSize} params={params} />
    </div>
  )
}

function Pagination({ page, hasMore, params }: { page: number; hasMore: boolean; params: Search }) {
  const base = new URLSearchParams()
  if (params.entity) base.set('entity', params.entity)
  if (params.source) base.set('source', params.source)
  if (params.q) base.set('q', params.q)
  const prev = new URLSearchParams(base)
  prev.set('page', String(Math.max(1, page - 1)))
  const next = new URLSearchParams(base)
  next.set('page', String(page + 1))
  return (
    <nav className="flex items-center justify-between text-sm text-neutral-400 pt-4">
      <div>{page > 1 && <a href={`/?${prev.toString()}`}>← Newer</a>}</div>
      <div>{hasMore && <a href={`/?${next.toString()}`}>Older →</a>}</div>
    </nav>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): add home page with entity/source/search filters and pagination"
```

---

## Task 18: Article detail page

**Files:**
- Create: `app/article/[id]/page.tsx`, `app/article/[id]/actions.ts`

- [ ] **Step 1: Implement `app/article/[id]/actions.ts`**

```ts
'use server'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function reportMismatch(formData: FormData) {
  const id = String(formData.get('id'))
  await db.update(schema.articles).set({ falsePositive: true }).where(eq(schema.articles.id, id))
  revalidatePath('/')
  revalidatePath(`/article/${id}`)
}
```

- [ ] **Step 2: Implement `app/article/[id]/page.tsx`**

```tsx
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { reportMismatch } from './actions'

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
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(dashboard): add article detail page with full text and report-mismatch"
```

---

## Task 19: Health endpoint + webhook alert

**Files:**
- Create: `app/api/health/route.ts`, `lib/alert.ts`
- Modify: `app/api/cron/poll/route.ts` (fold in stale-source alerting)

- [ ] **Step 1: Implement `app/api/health/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function GET() {
  const rows = await db.execute<{ source_id: string; kind: string; started_at: string; status: string }>(sql`
    select distinct on (source_id, kind) source_id, kind, started_at::text, status
    from cron_runs where kind in ('poll','enrich')
    order by source_id, kind, started_at desc
  `)
  const now = Date.now()
  const perSource: Record<string, { poll?: { at: string; status: string; ageMinutes: number }; enrich?: { at: string; status: string; ageMinutes: number } }> = {}
  for (const r of rows) {
    const sid = r.source_id ?? '_global'
    const ageMinutes = Math.floor((now - new Date(r.started_at).getTime()) / 60_000)
    perSource[sid] ??= {}
    perSource[sid][r.kind as 'poll' | 'enrich'] = { at: r.started_at, status: r.status, ageMinutes }
  }
  return NextResponse.json({ ok: true, sources: perSource })
}
```

- [ ] **Step 2: Implement `lib/alert.ts`**

```ts
import { db, schema } from '@/lib/db/client'
import { eq, sql } from 'drizzle-orm'

const STALE_THRESHOLD_MIN = 120
const ALERT_WINDOW_HOURS = 24

export async function maybeAlertStaleSources() {
  const webhook = process.env.ALERT_WEBHOOK_URL
  if (!webhook) return

  const rows = await db.execute<{ source_id: string; last_ok: string | null; last_alerted_at: string | null }>(sql`
    select s.id as source_id,
           (select max(started_at) from cron_runs c where c.source_id = s.id and c.kind = 'poll' and c.status = 'ok') as last_ok,
           s.last_alerted_at::text as last_alerted_at
    from sources s
    where s.enabled = true
  `)
  const now = Date.now()
  for (const r of rows) {
    const lastOk = r.last_ok ? new Date(r.last_ok).getTime() : 0
    const ageMin = lastOk ? (now - lastOk) / 60_000 : Infinity
    if (ageMin < STALE_THRESHOLD_MIN) continue
    const lastAlert = r.last_alerted_at ? new Date(r.last_alerted_at).getTime() : 0
    const alertAgeHr = (now - lastAlert) / 3_600_000
    if (alertAgeHr < ALERT_WINDOW_HOURS) continue

    await fetch(webhook, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `Source stale: ${r.source_id} (no successful poll in ${Math.floor(ageMin)}m)` }),
    }).catch(() => {})
    await db.update(schema.sources).set({ lastAlertedAt: new Date() }).where(eq(schema.sources.id, r.source_id))
  }
}
```

- [ ] **Step 3: Call alert at the end of `runPoll` in `app/api/cron/poll/route.ts`**

Modify `app/api/cron/poll/route.ts` `runPoll()` to call `maybeAlertStaleSources` before returning:

```ts
import { maybeAlertStaleSources } from '@/lib/alert'
// ... at end of runPoll:
await maybeAlertStaleSources()
return NextResponse.json({ ok: true, sources: results })
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ops): add health endpoint and stale-source webhook alerts"
```

---

## Task 20: Backfill script

**Files:**
- Create: `scripts/backfill.ts`, `app/admin/backfill/page.tsx`, `app/admin/backfill/actions.ts`

- [ ] **Step 1: Implement `scripts/backfill.ts`**

```ts
import 'dotenv/config'
import pLimit from 'p-limit'
import robotsParser from 'robots-parser'
import { db, schema } from '@/lib/db/client'
import { SOURCES } from '@/lib/sources'
import { canonicalizeUrl } from '@/lib/canonical'
import { extractArticle } from '@/lib/extractor'
import { matchText, type MatcherEntity } from '@/lib/matcher'
import { summarize } from '@/lib/summarizer'
import { eq, sql } from 'drizzle-orm'

const RPS_DEFAULT = 1 / 1.5
const MIN_DATE = new Date('2020-01-01T00:00:00Z')
const USER_AGENT = 'MudaNewsMonitorBot/1.0 (+https://muda-news-monitor.vercel.app)'

type Strategy = 'sitemap' | 'archive' | 'search'

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

async function loadRobots(baseUrl: string) {
  const txt = await fetchText(`${baseUrl.replace(/\/$/, '')}/robots.txt`)
  return robotsParser(`${baseUrl}/robots.txt`, txt ?? '')
}

async function* sitemapUrls(baseUrl: string): AsyncGenerator<string> {
  for (const path of ['/sitemap-news.xml', '/sitemap.xml']) {
    const xml = await fetchText(`${baseUrl.replace(/\/$/, '')}${path}`)
    if (!xml) continue
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
    for (const u of urls) {
      if (u.endsWith('.xml')) {
        const sub = await fetchText(u)
        if (sub) for (const m of sub.matchAll(/<loc>([^<]+)<\/loc>/g)) yield m[1].trim()
      } else {
        yield u
      }
    }
    return
  }
}

async function getEntities(): Promise<MatcherEntity[]> {
  const rows = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  return rows.map((e) => ({ slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind }))
}

async function processUrl(sourceId: string, url: string, entities: MatcherEntity[], withSummary: boolean): Promise<'skipped' | 'inserted' | 'no-match'> {
  const canonical = canonicalizeUrl(url)
  if (!canonical) return 'skipped'
  const existing = await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.url, canonical)).limit(1)
  if (existing.length) return 'skipped'
  const html = await fetchText(canonical)
  if (!html) return 'skipped'
  const { title, text } = extractArticle(html, canonical)
  if (!title || text.length < 100) return 'skipped'
  const result = matchText(`${title}\n${text}`, entities)
  if (result.scope.length === 0) return 'no-match'
  const summary = withSummary ? await summarize({ title, body: text }).catch(() => null) : null
  await db.insert(schema.articles).values({
    sourceId, url: canonical, title,
    publishedAt: null, snippet: text.slice(0, 500),
    fullText: text, aiSummary: summary,
    matchedEntities: [...result.scope, ...result.tag],
    matchedKeywords: result.matchedKeywords,
    enrichmentStatus: summary !== null ? 'done' : 'pending',
  })
  return 'inserted'
}

async function runForSource(sourceId: string, opts: { inlineSummary: boolean }) {
  const source = SOURCES.find((s) => s.id === sourceId)
  if (!source) throw new Error(`unknown source ${sourceId}`)
  const entities = await getEntities()
  const robots = await loadRobots(source.baseUrl)

  const start = new Date()
  let inserted = 0, skipped = 0, noMatch = 0
  const errors: unknown[] = []

  const rate = Number(process.env[`BACKFILL_RPS_${sourceId.toUpperCase()}`] ?? RPS_DEFAULT)
  const delayMs = Math.ceil(1000 / rate)
  const limit = pLimit(1)  // serial per source; rate-limit by sleep

  for await (const url of sitemapUrls(source.baseUrl)) {
    if (!robots.isAllowed(url, USER_AGENT)) { skipped++; continue }
    await new Promise((r) => setTimeout(r, delayMs))
    try {
      const r = await limit(() => processUrl(sourceId, url, entities, opts.inlineSummary))
      if (r === 'inserted') inserted++
      else if (r === 'no-match') noMatch++
      else skipped++
    } catch (e) {
      errors.push({ url, error: e instanceof Error ? e.message : String(e) })
    }
  }

  await db.insert(schema.cronRuns).values({
    kind: 'backfill', sourceId, startedAt: start, finishedAt: new Date(),
    articlesDiscovered: inserted, errors: errors as never,
    status: errors.length === 0 ? 'ok' : 'partial',
  })
  console.log(`${sourceId}: inserted=${inserted} no-match=${noMatch} skipped=${skipped} errors=${errors.length}`)
}

async function main() {
  const args = process.argv.slice(2)
  const sourceArg = args.find((a) => !a.startsWith('--'))
  const inlineSummary = args.includes('--inline-summary')
  const sourceIds = sourceArg ? [sourceArg] : SOURCES.map((s) => s.id)
  for (const id of sourceIds) {
    await runForSource(id, { inlineSummary })
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Implement admin backfill page**

Create `app/admin/backfill/actions.ts`:
```ts
'use server'
export async function triggerBackfillNote() {
  return 'Run locally: npm run backfill -- <source-id> [--inline-summary]'
}
```

Create `app/admin/backfill/page.tsx`:
```tsx
import { db, schema } from '@/lib/db/client'
import { desc, eq } from 'drizzle-orm'

export default async function BackfillPage() {
  const runs = await db.select().from(schema.cronRuns).where(eq(schema.cronRuns.kind, 'backfill')).orderBy(desc(schema.cronRuns.startedAt)).limit(50)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Backfill</h1>
      <p className="text-sm text-neutral-400">
        Backfill runs outside Vercel (800s budget isn&apos;t enough). From your local machine:
      </p>
      <pre className="bg-neutral-900 border border-neutral-800 rounded p-3 text-xs overflow-x-auto">npm run backfill -- &lt;source-id&gt; [--inline-summary]</pre>
      <h2 className="text-lg">Past backfill runs</h2>
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr><th className="text-left px-3 py-2">Source</th><th className="text-left px-3 py-2">Started</th><th className="text-left px-3 py-2">Finished</th><th className="text-left px-3 py-2">Inserted</th><th className="text-left px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 font-mono text-xs">{r.sourceId}</td>
                <td className="px-3 py-2 text-xs">{r.startedAt.toISOString()}</td>
                <td className="px-3 py-2 text-xs">{r.finishedAt?.toISOString() ?? '—'}</td>
                <td className="px-3 py-2">{r.articlesDiscovered}</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(backfill): add local backfill script and admin visibility page"
```

---

## Task 21: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push: { branches: [main] }

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
      ANTHROPIC_API_KEY: not-used-in-tests
      ADMIN_COOKIE_SECRET: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      ADMIN_PASSWORD: test
      CRON_SECRET: test-secret
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - name: Run migrations (if TEST_DATABASE_URL is set)
        if: env.DATABASE_URL != ''
        run: npx drizzle-kit push
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "ci: add GitHub Actions for unit tests and build"
```

---

## Task 22: README with setup instructions

**Files:**
- Create/overwrite: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# MUDA News Monitor

Monitors Malaysian news outlets for coverage of Parti MUDA in general and figures like Luqman Long specifically. Displays matches on a public dashboard with a password-gated admin UI for managing tracked entities.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — Neon / Vercel Postgres URL
   - `ANTHROPIC_API_KEY` — Claude API key
   - `ADMIN_PASSWORD` — admin page password
   - `ADMIN_COOKIE_SECRET` — 32-char random string (`openssl rand -hex 32`)
   - `CRON_SECRET` — random string; set as `CRON_SECRET` env var on Vercel
   - `ALERT_WEBHOOK_URL` (optional) — Slack/Discord/generic webhook for stale-source alerts
3. `npm run db:push` (applies migrations)
4. `npm run seed` (seeds sources + initial entities)
5. `npm run dev` (local)

## Deploy

1. Push to GitHub, import into Vercel (Pro plan).
2. Set all env vars in Vercel Project Settings.
3. Vercel Cron picks up `vercel.json` automatically: `/api/cron/poll` every 15 min, `/api/cron/enrich` every 5 min.

## Backfill historical articles

```bash
npm run backfill -- <source-id>                # queues rows; enrich cron fills summaries
npm run backfill -- <source-id> --inline-summary  # also summarizes inline (slower)
npm run backfill                               # all sources
```

Run from your laptop. Backfill for all sources can take several hours.

## Admin

Visit `/admin/login`, enter `ADMIN_PASSWORD`. Manage tracked entities, enable/disable sources, inspect cron runs.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: add README with setup, deploy, and backfill instructions"
```

---

## Self-review checklist (against spec)

Run through each spec section and confirm a task implements it:

- §3 Architecture & repo: Tasks 1, 4 (layout), 10-18 (routes).
- §4 Data model: Task 3.
- §5 Scraping pipeline: Tasks 7 (rss), 10 (poll), 11 (enrich).
- §6 Matching logic: Task 6.
- §7 AI summarization: Task 9.
- §8 Dashboard UX: Tasks 13 (admin shell), 14 (entities), 15 (sources), 16 (runs), 17 (home), 18 (article detail), 20 (backfill page).
- §9 Historical backfill: Task 20.
- §10 Error handling & observability: Tasks 10, 11 (per-source isolation, retry ladder, cron_runs), 19 (health + alert).
- §11 Testing: Tasks 5-9 (unit), 10-11, 14 (integration), 21 (CI).
- §12 Env vars: Task 1 `.env.example`, Task 22 README.

All sections covered.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-muda-news-monitor.md`. Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
