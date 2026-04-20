import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { matchText, type MatcherEntity } from '@/lib/matcher'

// Comprehensive keyword set for the MUDA scope entity — expand to catch any
// article "deeply related to Parti MUDA" without matching the bare Malay
// adjective "muda" (= young), which would flood the dashboard with false hits.
const MUDA_SCOPE_KEYWORDS = [
  // Party-name variants (Malay + English + full name)
  'parti muda',
  'muda party',
  'malaysian united democratic alliance',
  'ikatan demokratik malaysia',
  'ikatan demokrasi malaysia',

  // Leadership positions paired with the acronym
  'muda president',
  'presiden muda',
  'muda chief',
  'ketua muda',
  'muda deputy',
  'timbalan presiden muda',
  'pengerusi muda',
  'muda chairman',
  'muda secretary',
  'setiausaha muda',

  // Internal party governance
  'muda central committee',
  'muda supreme council',
  'majlis tertinggi muda',
  'muda convention',
  'konvensyen muda',
  'muda leadership',
  'kepimpinan muda',
  'muda division',
  'bahagian muda',
  'muda wing',

  // Electoral / political events
  'muda polls',
  'muda election',
  'pilihan raya muda',
  'pemilihan muda',
  'muda candidate',
  'calon muda',
  'muda manifesto',
  'manifesto muda',
  'muda mp',
  'muda dun',
  'muda adun',
  'muda parliament',
  'ahli parlimen muda',
  'muda rally',
  'perhimpunan muda',

  // Key figures (names unique enough to identify MUDA coverage even when
  // the party name isn't spelled out in the paragraph the keyword hits)
  'syed saddiq',
  'syed saddiq syed abdul rahman',
  'amira aisya',
  'luqman long',
]

const TAG_ENTITIES = [
  {
    slug: 'luqman-long',
    name: 'Luqman Long',
    keywords: ['luqman long', 'luqman bin long', 'lokman long'],
    requireAny: [] as string[],  // name is specific enough; no context gate needed
    kind: 'tag' as const,
    color: '#3b82f6',
  },
  {
    slug: 'syed-saddiq',
    name: 'Syed Saddiq',
    keywords: ['syed saddiq', 'syed saddiq syed abdul rahman'],
    requireAny: [] as string[],
    kind: 'tag' as const,
    color: '#22c55e',
  },
  {
    slug: 'amira-aisya',
    name: 'Amira Aisya',
    keywords: ['amira aisya', 'amira aisya abd aziz'],
    requireAny: [] as string[],
    kind: 'tag' as const,
    color: '#a855f7',
  },
]

async function main() {
  // Upsert MUDA scope entity
  await db.update(schema.trackedEntities)
    .set({
      keywords: MUDA_SCOPE_KEYWORDS,
      requireAny: [],
      name: 'Parti MUDA',
      color: '#f97316',
      enabled: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.trackedEntities.slug, 'muda'))
  console.log('Updated muda scope →', MUDA_SCOPE_KEYWORDS.length, 'keywords')

  // Upsert each tag entity (insert if missing, update if present)
  for (const tag of TAG_ENTITIES) {
    await db.insert(schema.trackedEntities).values(tag).onConflictDoUpdate({
      target: schema.trackedEntities.slug,
      set: {
        name: tag.name,
        keywords: tag.keywords,
        requireAny: tag.requireAny,
        color: tag.color,
        enabled: true,
        updatedAt: new Date(),
      },
    })
    console.log(`Upserted tag: ${tag.slug} (${tag.keywords.length} keywords, requireAny=${tag.requireAny.length})`)
  }

  // Re-match all articles against updated entities
  const entitiesDb = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  const entities: MatcherEntity[] = entitiesDb.map((e) => ({
    slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind,
  }))

  const rows = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    fullText: schema.articles.fullText,
    snippet: schema.articles.snippet,
  }).from(schema.articles)

  let kept = 0, dropped = 0
  const tagCounts = new Map<string, number>()
  for (const a of rows) {
    const text = `${a.title}\n${a.fullText ?? a.snippet ?? ''}`
    const r = matchText(text, entities)
    if (r.scope.length === 0) {
      await db.update(schema.articles).set({
        matchedEntities: [],
        matchedKeywords: [],
        falsePositive: true,
      }).where(eq(schema.articles.id, a.id))
      dropped++
    } else {
      const combined = [...r.scope, ...r.tag]
      for (const slug of combined) tagCounts.set(slug, (tagCounts.get(slug) ?? 0) + 1)
      await db.update(schema.articles).set({
        matchedEntities: combined,
        matchedKeywords: r.matchedKeywords,
        falsePositive: false,
      }).where(eq(schema.articles.id, a.id))
      kept++
    }
  }
  console.log(`\nRe-match complete:`)
  console.log(`  kept=${kept} dropped=${dropped}`)
  console.log(`  by entity:`)
  for (const [slug, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${slug.padEnd(16)} ${count}`)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
