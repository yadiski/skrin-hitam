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
