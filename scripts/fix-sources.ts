import 'dotenv/config'
import { db, schema } from '@/lib/db/client'
import { eq, inArray } from 'drizzle-orm'

async function main() {
  const DISABLE = ['thestar', 'sinarharian', 'astroawani', 'malaymail', 'theedge', 'bernama', 'other']
  await db.update(schema.sources).set({ enabled: false, updatedAt: new Date() }).where(inArray(schema.sources.id, DISABLE))
  // Remove any articles and cron_runs under the 'x' test source, then delete the source itself.
  await db.delete(schema.articles).where(eq(schema.articles.sourceId, 'x'))
  await db.delete(schema.cronRuns).where(eq(schema.cronRuns.sourceId, 'x'))
  await db.delete(schema.sources).where(eq(schema.sources.id, 'x'))
  const rows = await db.select({ id: schema.sources.id, enabled: schema.sources.enabled, rssUrl: schema.sources.rssUrl }).from(schema.sources).orderBy(schema.sources.id)
  console.log('Final source state:')
  for (const r of rows) console.log(`  [${r.enabled ? 'ON ' : 'OFF'}] ${r.id.padEnd(14)} ${r.rssUrl}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
