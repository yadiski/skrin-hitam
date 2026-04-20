# Skrin Hitam — by Payong Legam Malaysia

Malaysian political news monitor. Tracks coverage across multiple outlets for a configurable set of entities (Parti MUDA, Tangkap Azam Baki movement, etc.) and displays matches on a public multi-column dashboard with a password-gated admin UI for managing tracked entities.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — Neon / Vercel Postgres URL
   - `OPENROUTER_API_KEY` — OpenRouter API key (routes to Claude Haiku 4.5)
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
npm run backfill -- <source-id>                   # queues rows; enrich cron fills summaries
npm run backfill -- <source-id> --inline-summary  # also summarizes inline (slower)
npm run backfill                                  # all sources
```

Run from your laptop. Backfill for all sources can take several hours.

## Admin

Visit `/admin/login`, enter `ADMIN_PASSWORD`. Manage tracked entities, enable/disable sources, inspect cron runs.
