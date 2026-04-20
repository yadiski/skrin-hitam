import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { matchText, type MatcherEntity } from '@/lib/matcher'

// ─── Parti MUDA scope ────────────────────────────────────────────────────────
const MUDA_SCOPE_KEYWORDS = [
  // Party-name variants
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

  // Key figures
  'syed saddiq',
  'syed saddiq syed abdul rahman',
  'amira aisya',
  'luqman long',
]

// ─── Tangkap Azam Baki scope ─────────────────────────────────────────────────
// Broad civic-movement coverage: the figure (Azam Baki), the agency (SPRM/MACC),
// the protest slogan, and the named organisers/coalitions.
const AAB_SCOPE_KEYWORDS = [
  // The figure
  'azam baki',
  'tan sri azam baki',

  // The slogan / protest
  'tangkap azam baki',
  'gerakan tangkap azam baki',
  'protest azam baki',
  'himpunan tangkap azam baki',
  'rally azam baki',

  // The agency
  'sprm',
  'suruhanjaya pencegahan rasuah malaysia',
  'malaysian anti-corruption commission',
  'macc chief',
  'ketua pesuruhjaya sprm',
  'ketua pesuruhjaya macc',

  // Organiser orgs and coalitions
  'mandiri',
  'liga rakyat demokratik',
  'liga mahasiswa demokratik',
  'bersih 2.0',
  'coalition bersih',
  'gabungan pilihan raya bersih',
  'bersih coalition',
  'bersih protest',
  'perhimpunan bersih',

  // Related corruption-topic anchors that co-occur in coverage
  'share trading allegation',
  'azam baki saham',
  'azam baki shares',
  'azam baki declaration',
  'acc watchdog',
]

const SCOPE_ENTITIES = [
  {
    slug: 'muda',
    name: 'Parti MUDA',
    keywords: MUDA_SCOPE_KEYWORDS,
    requireAny: [] as string[],
    kind: 'scope' as const,
    color: '#f97316',
  },
  {
    slug: 'tangkap-azam-baki',
    name: 'Tangkap Azam Baki',
    keywords: AAB_SCOPE_KEYWORDS,
    requireAny: [] as string[],
    kind: 'scope' as const,
    color: '#ef4444',
  },
]

const TAG_ENTITIES = [
  {
    slug: 'luqman-long',
    name: 'Luqman Long',
    keywords: ['luqman long', 'luqman bin long', 'lokman long'],
    requireAny: [] as string[],
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
  {
    slug: 'azam-baki',
    name: 'Azam Baki',
    keywords: ['azam baki', 'tan sri azam baki'],
    requireAny: [] as string[],
    kind: 'tag' as const,
    color: '#f59e0b',
  },
  {
    slug: 'bersih',
    name: 'Bersih',
    keywords: ['bersih 2.0', 'coalition bersih', 'gabungan pilihan raya bersih', 'bersih coalition'],
    requireAny: [] as string[],
    kind: 'tag' as const,
    color: '#eab308',
  },
]

async function main() {
  // Upsert scope entities
  for (const s of SCOPE_ENTITIES) {
    await db.insert(schema.trackedEntities).values(s).onConflictDoUpdate({
      target: schema.trackedEntities.slug,
      set: {
        name: s.name,
        keywords: s.keywords,
        requireAny: s.requireAny,
        color: s.color,
        enabled: true,
        updatedAt: new Date(),
      },
    })
    console.log(`Upserted scope: ${s.slug} (${s.keywords.length} keywords)`)
  }

  // Upsert tag entities
  for (const t of TAG_ENTITIES) {
    await db.insert(schema.trackedEntities).values(t).onConflictDoUpdate({
      target: schema.trackedEntities.slug,
      set: {
        name: t.name,
        keywords: t.keywords,
        requireAny: t.requireAny,
        color: t.color,
        enabled: true,
        updatedAt: new Date(),
      },
    })
    console.log(`Upserted tag: ${t.slug} (${t.keywords.length} keywords)`)
  }

  // Re-match all existing articles against the updated entity set.
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
    console.log(`    ${slug.padEnd(20)} ${count}`)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
