import type { SourceDefinition } from '@/lib/types'
import { malaysiakini } from './malaysiakini'
import { thestar } from './thestar'
import { malaymail } from './malaymail'
import { fmt } from './fmt'
import { beritaharian } from './beritaharian'
import { harianmetro } from './harianmetro'
import { sinarharian } from './sinarharian'
import { astroawani } from './astroawani'
import { nst } from './nst'
import { theedge } from './theedge'
import { thevibes } from './thevibes'
import { malaysianow } from './malaysianow'
import { bernama } from './bernama'
import { thesun } from './thesun'
import { utusan } from './utusan'
import { other } from './other'

export const SOURCES: SourceDefinition[] = [
  malaysiakini, thestar, malaymail, fmt,
  beritaharian, harianmetro, sinarharian, astroawani,
  nst, theedge, thevibes, malaysianow, bernama, thesun, utusan,
  other,
]

// Sources the poll cron should hit via RSS. Excludes catch-all entries with empty rssUrl.
export const POLL_SOURCES: SourceDefinition[] = SOURCES.filter((s) => Boolean(s.rssUrl))

export function getSource(id: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.id === id)
}

export function inferSourceIdFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    const match = SOURCES.find((s) => {
      if (!s.baseUrl) return false
      const sHost = new URL(s.baseUrl).hostname.replace(/^www\./, '').toLowerCase()
      return host === sHost
    })
    return match?.id ?? 'other'
  } catch {
    return 'other'
  }
}
