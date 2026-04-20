# Near-Realtime News Fetching — Plan

> Goal: reduce latency from "article published at outlet" → "article visible on skrin-hitam deck" from the current ~15–20 minutes to under 2 minutes, with a stretch goal of sub-60s for WordPress-based outlets.

## Current latency breakdown

| Step | Latency |
|---|---|
| Outlet publishes article | t=0 |
| Outlet's RSS feed updates (cache + CDN) | +5 to +30 min |
| Our poll cron runs (every 15 min) | +0 to +15 min |
| Matcher + insert | +1 s |
| Enrich cron runs (every 5 min) | +0 to +5 min |
| Full-text extraction + AI summary | +5 s |
| Pill detects new article (45 s poll) | +0 to +45 s |
| Deck renders | +0 s (immediate on merge) |
| **Total worst-case** | **~55 minutes** |
| **Total typical** | **~10–20 minutes** |

Two dominant lags: **RSS cache freshness** and **15-min poll gap**. The rest is already fast.

## Target latency

| Tier | Target | Technique |
|---|---|---|
| **Tier 1** (quick wins) | p95 ≤ 2 min | Bump cron frequency + tighten pill poll |
| **Tier 3** (wp-json) | p95 ≤ 60 s for FMT, The Sun, Utusan | Direct `/wp-json/wp/v2/posts?after=…` polling every 60 s |
| **Tier 4** (UI streaming) | p95 ≤ 5 s UI reflection | SSE push from server to deck when new rows land |
| **Tier 2** (WebSub) | sub-second for supporting sites | Push-based: outlet pings our webhook on publish |

Tier 1 + Tier 3 together hit the "sub-2-minute" promise for most coverage. Tier 2 and Tier 4 are polish for "wow" factor; their value depends on whether you want aggressive realtime for the protest period specifically.

---

## Tier 1 — Quick wins (trivial, do first)

**Change:** Edit `vercel.json` to run crons more often.

```json
{
  "crons": [
    { "path": "/api/cron/poll", "schedule": "*/2 * * * *" },
    { "path": "/api/cron/enrich", "schedule": "*/2 * * * *" }
  ]
}
```

### Why it's safe

- RSS fetcher already sends `If-Modified-Since` / `If-None-Match` headers, so unchanged feeds return 304 in <100 ms — ~zero bandwidth cost.
- Per-source isolation means one slow source doesn't delay others.
- Poll route is idempotent; rapid re-runs just dedupe against `articles.url`.

### Cost impact

- Cron invocations: 15/hr → 60/hr per cron → total 120/hr × 24 × 30 = 86.4k/month.
  Well under Vercel Pro's 1M included invocations. **≈ $0 added.**
- Enrich cron: bound by the `PAGE_SIZE=20` queue per tick. More frequent ticks drain the pending queue faster but don't enlarge it — cost of AI summaries scales with *article volume*, not cron cadence. **≈ $0 added.**
- Neon Postgres: more `SELECT` / `INSERT` but all indexed and small. **Still free-tier.**

### Implementation

- 1 file changed (`vercel.json`).
- Git commit + push → Vercel auto-deploys.
- Effort: **5 minutes.**
- Latency: 15-min gap → 2-min gap.

---

## Tier 3 — WP-JSON direct polling (high ROI for FMT / The Sun / Utusan)

WordPress-based outlets expose `wp-json/wp/v2/posts?after=<ISO>&per_page=10&orderby=date&order=desc` — bypasses the outlet's RSS cache layer entirely and serves fresh posts within seconds of publish.

We already wrote adapters for the backfill (`scripts/backfill.ts`). Convert those adapters into a poll-time path.

### New cron or extension?

Add a second poll cron `/api/cron/wp-poll`, runs every 60 s:

```json
{ "path": "/api/cron/wp-poll", "schedule": "* * * * *" }
```

Every minute:
- For each wp-json adapter:
  - Fetch `/wp-json/wp/v2/posts?after=<last_poll_at>&per_page=20&_fields=id,link,date,title,content`
  - For each post: canonicalize → dedupe against DB → run matcher → insert with full text and null summary (enrich cron will fill summary)
  - Update `last_poll_at` per source

### Storage for `last_poll_at`

Add a column or lean on `cron_runs` history. Simplest: add `sources.last_successful_poll_at` timestamp, update on every successful poll.

Or simpler still: query `select max(published_at) from articles where source_id = $1`. Zero schema change.

### Latency win

FMT RSS feed is cached ~15 min at Cloudflare level; wp-json query is near-real-time (depends on WP's object cache, typically <60 s). Article published at 12:00:00 → wp-json visible at 12:00:30 → our cron picks up at 12:01:00 → DB insert at 12:01:01 → pill shows 12:01:46 (next 45 s poll) → click and see.

**Total: ~60–90 seconds from publish to user seeing it.**

### Cost impact

- 1 additional cron tick/min × 3 adapters = 3 HTTP calls/min. Negligible.
- One extra `articles.url` unique-key check per hit. Negligible.
- Effort: **~1–2 hours** to wire up and test.

---

## Tier 4 — Server-Sent Events for instant UI push

**Problem:** even with DB updates within 60 s, the deck's pill polls every 45 s. Worst case adds 45 s on top.

**Fix:** SSE endpoint `/api/stream?entity=<slug>&since=<iso>` keeps an open connection; server pushes a tiny event whenever a new row lands in the DB matching the subscription.

### Technology fit

- Vercel Pro + Fluid Compute supports long-lived connections up to function `maxDuration` (800 s).
- Reconnect every ~10 min is trivial on client.
- Alternative: short-polling interval drops from 45 s to 15 s — simpler, 99% as good.

### Rough design

Server: tiny in-memory event bus per Node instance. When an article is inserted (by poll/enrich/wp-poll), emit an event. SSE consumers pick up.

**Catch:** Vercel's serverless scales horizontally — the in-memory bus doesn't cross instances. Options:

- **Accept the limitation:** each client is stuck to one instance. When they reconnect, they may miss events briefly. Not great.
- **Neon LISTEN/NOTIFY:** Postgres has native pub/sub. Poll route `NOTIFY new_article 'slug'`, SSE subscribes via `LISTEN`. Works across instances. Requires a persistent connection per SSE client → could be expensive at scale.
- **Redis pub/sub (Upstash):** $10/mo. Clean. Probably overkill for this project's scale.

### Recommendation for Tier 4

Drop the SSE plan, instead **reduce pill poll interval from 45 s → 10 s when the deck has focus; 60 s when backgrounded**. Hits 95% of the UX win at zero infrastructure cost.

Effort: **~15 minutes.**

---

## Tier 2 — WebSub push (most ambitious, likely not worth it for MY outlets)

### What it is

Outlets that support WebSub (RSS `<link rel="hub" href="…">`) can push notifications to a subscriber when their feed updates. Sub-second latency.

### Reality

- Google shut down its public hub in 2018.
- Surviving hubs: Superfeedr ($15/mo starter, $50/mo production), self-hosted options.
- WordPress has a WebSub plugin that enables pubsubhubbub.superfeedr.com by default.
- **Are MY outlets on it?** Unclear. Probably not — Malaysian CMS installs rarely enable WebSub plugins.

### Verdict

Likely no payoff. **Skip.** If a specific outlet's feed lists a hub, it's a 1-hour integration to subscribe, but don't go looking.

---

## Proposed order of operations

| Step | Effort | Latency after | Recommend? |
|---|---|---|---|
| 1. Tier 1: bump cron to `*/2` | 5 min | ~2 min | **Yes, immediate** |
| 2. Tier 3: wp-json poll cron | 2 hours | ~60 s | **Yes, high ROI** |
| 3. Tier 4 (lite): pill 10 s on focus | 15 min | +10 s worst case | **Yes** |
| 4. Tier 2: WebSub discovery + subscribe | 4+ hours | sub-second | **Skip** unless you have a specific outlet on WebSub |
| 5. Tier 4 (full): SSE + Neon LISTEN/NOTIFY | 1 day | sub-second | **Skip** for now |

Total steps 1–3: **~3 hours of work**, moves the dashboard from "~15 min stale" to "sub-2 min" end-to-end.

---

## Non-goals / caveats

- **We can't beat the outlet's publish pipeline.** If FMT takes 30 s between author clicks "Publish" and wp-json reflects the new post, our lower bound is 30 s + our cron interval.
- **We don't spoof a browser.** Our crawler obeys robots.txt, conditional GETs, rate limits per source. If an outlet rate-limits our UA, we back off to respect it; realtime isn't a licence to hammer.
- **OpenRouter summary latency stays ~5 s.** Summaries fill in after the article appears. UI already handles this gracefully ("Summary pending…").

---

## Open question

For the **Tangkap Azam Baki** coverage window specifically, do we want to:

- (a) Apply Tier 1 + Tier 3 + Tier 4-lite to everything, or
- (b) Leave the 15-min cron for MUDA and *only* aggressively poll for the AAB keywords + Bersih keywords during the protest window (e.g., a dedicated `wp-poll-aab` cron)?

Option (b) is cheaper-resource but adds complexity. Option (a) benefits all coverage, not just the event. Unless there's a cost concern, (a) is cleaner.
