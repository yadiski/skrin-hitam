import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import {
  WP_JSON_ADAPTERS,
  fetchWpJsonPosts,
  getEnabledMatcherEntities,
  processWpJsonPost,
  type WpJsonAdapter,
  type WpPost,
} from '@/lib/sources/wp-json'
import { eq } from 'drizzle-orm'
import type { MatcherEntity } from '@/lib/matcher'

const DELAY_MS = 600

async function runForAdapter(
  adapter: WpJsonAdapter,
  query: string,
  entities: MatcherEntity[],
  opts: { inlineSummary: boolean; maxPages: number },
) {
  const start = new Date()
  let inserted = 0, skipped = 0, noMatch = 0
  const errors: Array<{ url: string; error: string }> = []

  for (let page = 1; page <= opts.maxPages; page++) {
    let posts: WpPost[]
    try {
      posts = await fetchWpJsonPosts(adapter, { search: query, page, perPage: 50, timeoutMs: 20_000 })
    } catch (e) {
      errors.push({ url: `${adapter.sourceId} page ${page}`, error: e instanceof Error ? e.message : String(e) })
      break
    }
    if (posts.length === 0) break

    console.log(`  [${adapter.sourceId}] query="${query}" page=${page} got ${posts.length}`)

    for (const post of posts) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
      try {
        const r = await processWpJsonPost(adapter, post, entities, opts)
        if (r === 'inserted') { inserted++; process.stdout.write('+') }
        else if (r === 'no-match') { noMatch++; process.stdout.write('.') }
        else { skipped++; process.stdout.write('s') }
      } catch (e) {
        errors.push({ url: post.link, error: e instanceof Error ? e.message : String(e) })
        process.stdout.write('E')
      }
    }
    process.stdout.write('\n')

    if (posts.length < 50) break
  }

  await db.insert(schema.cronRuns).values({
    kind: 'backfill',
    sourceId: adapter.sourceId,
    startedAt: start,
    finishedAt: new Date(),
    articlesDiscovered: inserted,
    errors: errors as never,
    status: errors.length === 0 ? 'ok' : 'partial',
  })
  console.log(`${adapter.sourceId}: inserted=${inserted} no-match=${noMatch} skipped=${skipped} errors=${errors.length}`)
}

async function main() {
  const args = process.argv.slice(2)
  const inlineSummary = args.includes('--inline-summary')
  const maxPagesArg = args.find((a) => a.startsWith('--max-pages='))
  const maxPages = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : 10
  const sourceArg = args.find((a) => !a.startsWith('--'))

  const entitiesDb = await db.select().from(schema.trackedEntities).where(eq(schema.trackedEntities.enabled, true))
  const entities = entitiesDb.map((e) => ({ slug: e.slug, keywords: e.keywords, requireAny: e.requireAny, kind: e.kind }))
  if (entities.length === 0) {
    console.error('no enabled tracked entities')
    process.exit(1)
  }

  const adapters = sourceArg ? WP_JSON_ADAPTERS.filter((a) => a.sourceId === sourceArg) : WP_JSON_ADAPTERS
  if (adapters.length === 0) {
    console.error(`no adapter for source ${sourceArg}. Available: ${WP_JSON_ADAPTERS.map((a) => a.sourceId).join(', ')}`)
    process.exit(1)
  }

  const queries = Array.from(new Set(
    entities.flatMap((e) => e.keywords).map((k) => k.trim()).filter((k) => k.length >= 3),
  ))

  console.log(`Backfilling ${adapters.length} site(s) × ${queries.length} queries, up to ${maxPages} pages each (${inlineSummary ? 'with' : 'without'} inline summaries)`)
  for (const adapter of adapters) {
    for (const query of queries) {
      await runForAdapter(adapter, query, entities, { inlineSummary, maxPages })
    }
  }
}

// getEnabledMatcherEntities is unused in this script (we hit trackedEntities directly) but
// keep the import noise out by referencing it once so the linter doesn't complain if we
// change the helper surface later.
void getEnabledMatcherEntities

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
