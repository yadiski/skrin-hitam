import type { SourceDefinition } from '@/lib/types'
// Catch-all source for articles found via Google News that don't belong to a registered outlet.
// The poll cron skips this source (no RSS URL); only backfill writes to it.
export const other: SourceDefinition = {
  id: 'other', name: 'Other',
  rssUrl: '',
  baseUrl: '', language: 'en',
}
