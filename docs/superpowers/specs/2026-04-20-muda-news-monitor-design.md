# Parti MUDA News Monitor — Design Spec

**Date:** 2026-04-20
**Status:** Approved, ready for implementation planning
**Repo:** `muda-news-monitor` (new, in `payong-legam/`)

## 1. Purpose

Continuously monitor major Malaysian news outlets for coverage of Parti MUDA in general and of Luqman Long specifically. Surface matches on a public web dashboard that links through to the original articles. Keywords and tracked entities are editable from an admin UI so the monitor can be adapted to track other figures or parties later.

## 2. Requirements summary

- **Cadence:** Poll every 15 minutes.
- **Sources:** Malaysiakini, The Star, Malay Mail, FMT, Berita Harian, Harian Metro, Sinar Harian, Astro Awani (English + Bahasa Malaysia).
- **Matching:** Dynamic entities stored in DB. Two kinds:
  - `scope` — articles are kept in DB only if they match a scope entity. Seeded with "Parti MUDA".
  - `tag` — labels applied on top of scoped articles. Seeded with "Luqman Long".
  - Entities support keyword variants and optional `require_any` context keywords.
- **Storage:** Metadata + full extracted text + AI-generated 2-3 sentence English summary per article.
- **Backfill:** All-time at launch (one-off local script).
- **Dashboard:** Public, reverse-chronological, filterable, click-through to source. Admin page password-gated for entity/source/backfill management.
- **Host:** Vercel Pro (Fluid Compute 800s functions, cron every 15 min).

## 3. Architecture

Single Next.js 16 (App Router, React 19+) TypeScript monorepo. Cron-driven pipeline with two stages for resilience: fast poll separate from slow enrich.

```
muda-news-monitor/
├── app/
│   ├── page.tsx                   # Public dashboard (list view)
│   ├── article/[id]/page.tsx      # Public article detail
│   ├── admin/
│   │   ├── page.tsx               # Admin home (password-gated via middleware)
│   │   ├── entities/page.tsx      # Tracked entities CRUD
│   │   ├── sources/page.tsx       # Source toggle + RSS edit
│   │   ├── runs/page.tsx          # Cron run history
│   │   └── backfill/page.tsx      # Trigger per-source backfill
│   └── api/
│       ├── cron/poll/route.ts     # Every 15 min: RSS poll + dedupe
│       ├── cron/enrich/route.ts   # Every 5 min: fetch body + summarize
│       ├── health/route.ts        # Health check (last successful runs)
│       └── admin/rematch/route.ts # Kick re-match over existing articles
├── lib/
│   ├── sources/                   # One file per outlet (RSS url, fallbacks)
│   ├── matcher.ts                 # Keyword + context matching
│   ├── extractor.ts               # Readability-based body extraction
│   ├── summarizer.ts              # Claude Haiku wrapper with prompt cache
│   ├── canonical.ts               # URL canonicalization
│   └── db.ts                      # Drizzle ORM + Neon client
├── drizzle/                       # Schema + migrations
├── scripts/
│   └── backfill.ts                # One-off all-time archive scrape
├── middleware.ts                  # Admin password gate
├── vercel.json                    # Cron schedule
└── tests/
    ├── unit/                      # matcher, extractor, canonical
    └── integration/               # poll + enrich with test Neon branch
```

Two crons deliberately:
- `poll` finishes in seconds (RSS fetch + dedupe). Keeps discovery reliable.
- `enrich` can take longer per batch (HTML fetch + AI summary). Isolated so slow summaries never block new-article discovery.

## 4. Data model (Postgres via Drizzle, hosted on Neon/Vercel Postgres)

```
sources
  id (text PK)                -- 'malaysiakini', 'thestar', ...
  name (text)
  rss_url (text)
  base_url (text)
  language (text)             -- 'en' | 'ms'
  enabled (bool, default true)
  last_alerted_at (timestamptz, nullable) -- dedupe for webhook alerts
  created_at, updated_at

tracked_entities
  id (uuid PK)
  slug (text unique)          -- 'muda', 'luqman-long'
  name (text)                 -- 'Parti MUDA'
  keywords (text[])           -- ['Luqman Long', 'Luqman bin Long', 'Lokman Long']
  require_any (text[])        -- ['MUDA', 'Parti MUDA']; empty = no context requirement
  kind (enum: 'scope' | 'tag')
  color (text)                -- badge color for dashboard
  enabled (bool, default true)
  created_at, updated_at

articles
  id (uuid PK)
  source_id (fk sources.id)
  url (text unique)           -- canonical; dedupe key
  title (text)
  published_at (timestamptz)
  discovered_at (timestamptz, default now())
  snippet (text)              -- from RSS description
  full_text (text, nullable)  -- populated by enrich
  ai_summary (text, nullable) -- populated by enrich
  matched_entities (text[])   -- entity slugs matched on this article
  matched_keywords (text[])   -- concrete keywords that hit
  enrichment_status (enum: 'pending' | 'done' | 'failed', default 'pending')
  enrichment_error (text, nullable)
  enrichment_attempts (int, default 0)
  false_positive (bool, default false)
  search_tsv (tsvector, generated from title + full_text)

  indexes:
    (published_at DESC)
    GIN(matched_entities)
    GIN(search_tsv)
    (enrichment_status, discovered_at) -- for enrich queue

cron_runs
  id (uuid PK)
  kind (enum: 'poll' | 'enrich' | 'backfill')
  source_id (text, fk, nullable)
  started_at, finished_at (timestamptz)
  articles_discovered (int, default 0)
  articles_enriched (int, default 0)
  errors (jsonb, default '[]')
  status (enum: 'ok' | 'partial' | 'failed')
```

### Why this shape

- `matched_entities text[]` replaces per-entity boolean columns so new entities don't require migrations.
- `scope` vs `tag` separation lets us add tags (e.g., other MUDA members) without broadening the corpus accidentally.
- `enrichment_status` keeps articles visible even when body/summary fail — we never lose a metadata row to a transient fetch error.
- `false_positive` flag supports a "Report mismatch" feedback loop on the detail page.

## 5. Scraping pipeline

### Poll cron (every 15 min, ~10–30s)

```
for each enabled source (parallel, p-limit = 4):
  fetch RSS with If-Modified-Since header + 10s timeout
  parse with rss-parser
  for each item:
    url = canonicalize(item.link)               // strip utm_*, fragments, trailing slash
    if articles.url exists: skip                // dedupe
    matches = match(item.title + ' ' + item.contentSnippet, enabledEntities)
    if matches.scope is empty: skip             // not in scope
    insert articles row {
      url, title, source_id, published_at,
      snippet = item.contentSnippet,
      matched_entities = [...matches.scope, ...matches.tag],
      matched_keywords = matches.matchedKeywords,
      enrichment_status = 'pending'
    }
  record cron_runs row
```

### Enrich cron (every 5 min, batch of up to 20)

```
pending = select from articles
  where enrichment_status = 'pending' and enrichment_attempts < 3
  order by published_at desc limit 20

for each article (parallel, p-limit = 3):
  html = fetch(article.url, { timeout 20s, realistic User-Agent })
  { title, content } = readability.parse(html)
                       // per-source fallback: lib/sources/<id>.ts selector
  if content.length < 200:
    update row: enrichment_status = 'done', full_text = content, ai_summary = null
    continue
  rematch = match(title + ' ' + content, enabledEntities)
  summary = summarize(title, content)  // Claude Haiku, cached system prompt
  update row:
    full_text = content,
    ai_summary = summary,
    matched_entities = [...rematch.scope, ...rematch.tag],
    matched_keywords = rematch.matchedKeywords,
    enrichment_status = 'done'
  on any error:
    enrichment_attempts += 1,
    enrichment_error = <message>,
    enrichment_status = 'pending' if attempts < 3 else 'failed'
```

### Retry ladder

Enrichment failures retry on the next cron tick, bounded by `enrichment_attempts < 3`. Because enrich runs every 5 min, effective backoff is 5m → 10m → 15m before giving up. Admin can manually re-queue from `/admin/runs` by resetting `enrichment_status` back to `pending` and `enrichment_attempts` to 0.

### Source list (initial; RSS URLs verified during implementation)

| Source | Candidate RSS | Fallback |
|---|---|---|
| Malaysiakini | `/en/news.rss`, `/bm/news.rss` | sitemap |
| The Star | `/rss/News/Nation` | sitemap |
| Malay Mail | `/feed/rss/malaysia` | sitemap |
| FMT | `/category/nation/feed/` | sitemap |
| Berita Harian | `/rss/berita/nasional` | sitemap |
| Harian Metro | `/rss/mutakhir` | sitemap |
| Sinar Harian | `/rssfeed/nasional` | sitemap |
| Astro Awani | `/rss.xml` | sitemap |

## 6. Matching logic (`lib/matcher.ts`)

```ts
type TrackedEntity = {
  slug: string
  keywords: string[]
  requireAny: string[]
  kind: 'scope' | 'tag'
}

type MatchResult = {
  scope: string[]          // entity slugs matched (kind='scope')
  tag: string[]            // entity slugs matched (kind='tag')
  matchedKeywords: string[]
}

function match(text: string, entities: TrackedEntity[]): MatchResult
```

### Algorithm

1. **Normalize text:** lowercase, collapse whitespace, strip Malay honorifics (`YB`, `Dato'`, `Dato`, `Datuk`, `Tuan`, `Encik`, `Sdr`, `Puan`). Keywords stored in `tracked_entities.keywords` are expected to be stored honorific-free; the same lowercase/whitespace normalization is applied to keywords at match time for symmetry.
2. **Per entity, for each keyword:**
   - Single-word keyword → word-boundary regex `\b<keyword>\b`.
   - Multi-word keyword → require all tokens in order with up to 3 characters of filler between (so "Luqman bin Long" matches "Luqman Long").
3. **Context gate:** if `requireAny` is non-empty, the text must also contain at least one of those keywords (same word-boundary rules). If not, entity does not match even if its keywords hit.
4. **Classify:** matched entities split into `scope` and `tag` by `kind`.

### Edge cases handled

- `"Mohd Luqman bin Long"` → matches `Luqman Long` keyword via token-with-filler rule.
- `"Lokman Long"` (common typo) → caught via explicit variant keyword.
- `"Luqman bin Ahmad"` in an article about MUDA → no match (different person, "Long" absent).
- RSS-snippet-only match (short text) → article still scoped in; matcher re-runs against `full_text` during enrich to pick up additional tag entities.

## 7. AI summarization (`lib/summarizer.ts`)

- **Model:** `claude-haiku-4-5-20251001` via `@anthropic-ai/sdk`.
- **Prompt caching:** system prompt marked with `cache_control: { type: 'ephemeral' }` (4-hour TTL). Steady-state cost is dominated by the article body.
- **System prompt:** instructs 2–3 sentences, neutral English, focus on who/what/when and notable quotes, English output even when the article is in Bahasa Malaysia.
- **User message:** `<title>\n\n<full_text truncated to 8000 chars>`.
- **Guards:**
  - `full_text.length < 200` → skip summarization, set `ai_summary = null` with `enrichment_status = 'done'`.
  - API error → handled by the enrich retry ladder (§5). No fake-summary fallback.

### Expected cost

~50 articles/day × ~2k input tokens + 150 output tokens with cached system prompt ≈ **under $0.05/day**.

## 8. Dashboard UX

**Stack:** Next.js 16 App Router, React 19+, Tailwind v4, shadcn/ui. Dark mode default. Newsroom-feel: clean, monospace-leaning accents.

### `/` — Home (public)

- Top bar: app title, entity filter chips (`All`, `Parti MUDA`, `Luqman Long`, plus any future entities), source multiselect, search box (full-text via `search_tsv`), date-range picker.
- Main: reverse-chronological list, 25 per page, infinite scroll.
- URL state is the source of truth for filters: `?entity=luqman-long&source=malaysiakini&q=…&from=…&to=…` — every view is shareable.
- Each card shows:
  - Source badge + published date (relative, e.g., "2h ago")
  - Title (anchor, opens original article in new tab with `rel="noopener"`)
  - AI summary, or `Summary pending…` placeholder if not yet enriched
  - Matched-entity badges (colored per entity)
  - Secondary `Read original ↗` link for clarity
- First paint server-rendered; filter changes via Server Actions.

### `/article/[id]` — Detail (public)

- Title, source, published date.
- Primary CTA: `Open original article ↗`.
- AI summary.
- Full extracted text with keyword highlights for `matched_keywords`.
- Matched-entity badges and concrete matched keywords.
- `Report mismatch` button → flips `false_positive = true` on the row for admin review.

### `/admin/*` — Password-gated

Gate is a Next.js middleware check against `ADMIN_PASSWORD` env var; on mismatch, return 401 with a minimal login page that sets an HttpOnly signed cookie.

- **Entities:** table with inline edits for `name`, `keywords`, `require_any`, `kind`, `color`, `enabled`. Save triggers `/api/admin/rematch` to re-evaluate existing `full_text` against the changed entity.
- **Sources:** toggle `enabled`, edit `rss_url`, last successful poll timestamp and error count per source.
- **Cron runs:** last 50 runs across both crons with status badges and error payloads.
- **Backfill:** per-source trigger + live progress log (reads from `cron_runs` rows with `kind='backfill'`).

## 9. Historical backfill (`scripts/backfill.ts`)

Long-running Node script, run locally once. Also triggerable from `/admin/backfill` for incremental per-source reruns.

### Strategies, priority order per source

1. **XML sitemap crawl** — fetch `sitemap.xml` / `sitemap-news.xml`, filter to article URLs, iterate.
2. **Dated archive pages** — e.g., `/archive/2023/11/15`, walked backwards until pre-2020-01-01 (before MUDA's formation).
3. **Site search** — e.g., `/search?q=MUDA`, paginated; fallback only.

### Process

```
for each source, first strategy that yields URLs:
  for each candidate URL (throttled to 1 request / 1.5s per source):
    if robots.txt disallows: skip
    if articles.url exists: skip
    html = fetch(url)
    { title, content } = readability.parse(html)
    matches = match(title + ' ' + content, enabledEntities)
    if matches.scope is empty: skip
    insert articles row with full_text + enrichment_status = 'pending'
    (summarizer runs via the normal enrich cron, or inline if run with --inline-summary)
  write a cron_runs row with kind='backfill', counts, and any errors
```

Resumability: the `articles.url` unique index is the checkpoint. On restart, the script re-walks the strategy from the top and skips URLs already inserted. No explicit cursor needed; the DB itself records what's been processed.

### Constraints

- Respects `robots.txt` via `robots-parser`.
- Per-source rate limit configurable via env (`BACKFILL_RPS_<source_id>`), default 1 req / 1.5s.
- Runs outside Vercel functions: all-time over 8 sources is realistically 2–8 hours. Local one-off or a Railway job is the right fit; Vercel's 800s budget is for forward-looking cron only.

## 10. Error handling & observability

### Principles

- **Fail loudly, keep the pipeline running.** A single source or article failure must never stop the others.
- **No silent fallbacks.** If body extraction returns garbage, we store nothing and mark the row `failed` — we don't call a truncated HTML blob a `full_text`.
- **Absence over fake.** A missing summary is displayed as "Summary unavailable" with reason on the detail page, never as a truncated body pretending to be a summary.

### Mechanisms

- **Per-source isolation:** each source's poll is independent `try/catch`; its own `cron_runs` row records outcome. Parent poll returns 200 so Vercel doesn't alert on expected upstream outages.
- **Retry ladder:** enrich failures retry via `enrichment_attempts` counter up to 3 attempts (effective backoff 5/10/15 min). Terminal failures surface in `/admin/runs`.
- **Structured logs:** JSON lines per cron: `{ run_id, source, stage, duration_ms, items_found, items_new, error }`. Readable by Vercel log drains.
- **Health endpoint:** `/api/health` returns last successful `poll` and `enrich` timestamps per source; shown on `/admin` with status badges.
- **Optional webhook alert:** if `ALERT_WEBHOOK_URL` is set, the tail of each `poll` cron run checks whether any enabled source now has a gap of >2 hours since its last successful poll. If so, the webhook fires once per affected source per 24h window (dedupe via `sources.last_alerted_at`). This detects partial outages. If the `poll` cron itself stops running entirely, external uptime monitoring of `/api/health` catches it — set up manually via e.g. UptimeRobot against the health endpoint.

### Explicitly not doing

- No retries on 4xx responses (indicates blocking; needs human review, not brute force).
- No swallowed parse errors — everything lands in `cron_runs.errors`.
- No DB mocks in tests — real Postgres via Neon test branches.

## 11. Testing

### Unit (Vitest)

- `lib/matcher.ts` — fixtures of 30+ Malay/English headlines and bodies covering: honorifics, variants, skip-word tolerance, false positives, context-gate enforcement. This is the heart of the system; coverage must be exhaustive.
- `lib/extractor.ts` — snapshot test against one saved HTML sample per source, asserting sane body extraction.
- `lib/canonical.ts` — tracking-param stripping, trailing-slash normalization, fragment removal.

### Integration (Vitest + ephemeral Neon branch per CI run)

- `poll` end-to-end with stubbed RSS fetches: handler runs, correct rows inserted with correct `matched_entities`.
- `enrich` end-to-end with stubbed HTML + Claude API: row transitions `pending → done` with expected summary.
- Entity edit re-match: seed articles, edit entity keywords, assert `matched_entities` on existing rows update correctly.
- Dedupe: run `poll` twice on same fixtures, assert no duplicate article rows.

### Not tested automatically

- Dashboard UI — smoke-tested manually per deploy. Not worth a Playwright harness for a read-only list.
- Claude API itself — stubbed; we test prompt construction and response parsing, not the model.

### CI

GitHub Actions runs unit + integration on every PR. Integration uses a short-lived Neon branch seeded from Drizzle migrations. Main branch auto-deploys to Vercel preview; tagged releases promote to production.

### Manual pre-ship checklist

- Backfill run locally produces reasonable article counts per source.
- Spot-check 10 random articles in dashboard: summary accuracy, entity tags, click-through works.
- `/admin` password gate works; entity edit triggers re-match.
- Health endpoint reports green for all sources after first successful poll + enrich cycle.

## 12. Environment variables

```
DATABASE_URL                    # Neon / Vercel Postgres
ANTHROPIC_API_KEY               # Claude Haiku for summaries
ADMIN_PASSWORD                  # Admin page gate
ADMIN_COOKIE_SECRET             # HMAC signing for admin session cookie
ALERT_WEBHOOK_URL               # Optional: alerts on stale polls
BACKFILL_RPS_<source_id>        # Optional: per-source backfill rate (default 1/1.5s)
```

## 13. Out of scope for v1

- Multi-user auth on admin (single shared password is enough for now).
- Email/push notifications on new articles (can layer on the same DB later).
- Social media (Twitter/X, Facebook, TikTok) monitoring.
- Sentiment analysis or automated categorization beyond entity tagging.
- Translation of full article body (only the AI summary is English).
