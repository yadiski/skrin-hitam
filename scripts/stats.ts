import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import { sql, desc } from 'drizzle-orm'

async function main() {
  const total = await db.execute<{ count: number }>(sql`select count(*)::int as count from articles`)
  const bySource = await db.execute<{ source_id: string; count: number }>(sql`select source_id, count(*)::int as count from articles group by source_id order by count desc`)
  const byStatus = await db.execute<{ enrichment_status: string; count: number }>(sql`select enrichment_status, count(*)::int as count from articles group by enrichment_status`)
  const byEntity = await db.execute<{ slug: string; count: number }>(sql`select unnest(matched_entities) as slug, count(*)::int as count from articles group by slug order by count desc`)
  const newest = await db.select({ title: schema.articles.title, publishedAt: schema.articles.publishedAt, sourceId: schema.articles.sourceId }).from(schema.articles).orderBy(desc(schema.articles.publishedAt)).limit(5)

  console.log('=== Articles ===')
  console.log(`Total: ${total.rows[0].count}`)
  console.log('\nBy source:')
  for (const r of bySource.rows) console.log(`  ${r.source_id.padEnd(14)} ${r.count}`)
  console.log('\nBy enrichment status:')
  for (const r of byStatus.rows) console.log(`  ${r.enrichment_status.padEnd(10)} ${r.count}`)
  console.log('\nBy matched entity:')
  for (const r of byEntity.rows) console.log(`  ${r.slug.padEnd(14)} ${r.count}`)
  console.log('\nNewest 5:')
  for (const r of newest) console.log(`  ${r.publishedAt?.toISOString().slice(0,10) ?? '----------'} [${r.sourceId}] ${r.title.slice(0, 80)}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
