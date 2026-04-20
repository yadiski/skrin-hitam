import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import { SOURCES } from '@/lib/sources'
import type { TrackedEntityInput } from '@/lib/types'

// Sources without a verified RSS endpoint; kept in the registry for admin visibility
// but disabled so the poll cron skips them. Admin can toggle on once a feed is found.
const DISABLED_BY_DEFAULT = new Set([
  'thestar',       // no public RSS found as of 2026-04
  'sinarharian',   // robots.txt disallows /rss
  'astroawani',    // no public RSS found
  'malaymail',     // no public RSS found
  'theedge',       // no public RSS found
  'bernama',       // no public RSS found
  'other',         // catch-all; backfill-only
])

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
  // Upsert sources: keep DB in sync with the code registry for rssUrl/name/language/enabled.
  for (const s of SOURCES) {
    const enabled = !DISABLED_BY_DEFAULT.has(s.id)
    await db.insert(schema.sources).values({
      id: s.id, name: s.name, rssUrl: s.rssUrl, baseUrl: s.baseUrl, language: s.language, enabled,
    }).onConflictDoUpdate({
      target: schema.sources.id,
      set: {
        name: s.name,
        rssUrl: s.rssUrl,
        baseUrl: s.baseUrl,
        language: s.language,
        // Do NOT overwrite `enabled` on re-seed — admin UI may have toggled it.
        updatedAt: new Date(),
      },
    })
  }

  const disabledIds = SOURCES.filter((s) => DISABLED_BY_DEFAULT.has(s.id)).map((s) => s.id)

  for (const e of ENTITIES) {
    await db.insert(schema.trackedEntities).values(e).onConflictDoNothing({ target: schema.trackedEntities.slug })
  }

  console.log('Seed complete:', SOURCES.length, 'sources (' + (SOURCES.length - disabledIds.length) + ' enabled),', ENTITIES.length, 'entities')
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
