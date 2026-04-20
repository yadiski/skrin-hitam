import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { matchText, type MatcherEntity } from '@/lib/matcher'

async function main() {
  // MUDA scope: match any of these phrases that unambiguously signal the party
  // (not bare "muda" which collides with the Malay adjective for "young").
  const scopeKeywords = [
    'parti muda',
    'muda party',
    'malaysian united democratic alliance',
    'presiden muda',
    'president of muda',
    'muda youth wing',
    'muda president',
    'ahli muda',
    'muda member',
    'muda leadership',
    'muda polls',
    'muda chief',
    'muda deputy',
    'muda election',
  ]
  await db.update(schema.trackedEntities)
    .set({ keywords: scopeKeywords, updatedAt: new Date() })
    .where(eq(schema.trackedEntities.slug, 'muda'))
  console.log('Updated muda keywords →', scopeKeywords.length, 'phrases')

  // Keep Luqman Long permissive on context (bare 'muda' here is a context gate, not a match trigger)
  await db.update(schema.trackedEntities)
    .set({
      keywords: ['luqman long', 'luqman bin long', 'lokman long'],
      requireAny: ['muda', 'parti muda', 'muda party'],
      updatedAt: new Date(),
    })
    .where(eq(schema.trackedEntities.slug, 'luqman-long'))
  console.log('Updated luqman-long entity')

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
      await db.update(schema.articles).set({
        matchedEntities: [...r.scope, ...r.tag],
        matchedKeywords: r.matchedKeywords,
        falsePositive: false,
      }).where(eq(schema.articles.id, a.id))
      kept++
    }
  }
  console.log(`Re-match done. kept=${kept} dropped=${dropped}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
