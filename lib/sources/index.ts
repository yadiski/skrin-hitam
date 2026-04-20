import type { SourceDefinition } from '@/lib/types'
import { malaysiakini } from './malaysiakini'
import { thestar } from './thestar'
import { malaymail } from './malaymail'
import { fmt } from './fmt'
import { beritaharian } from './beritaharian'
import { harianmetro } from './harianmetro'
import { sinarharian } from './sinarharian'
import { astroawani } from './astroawani'

export const SOURCES: SourceDefinition[] = [
  malaysiakini, thestar, malaymail, fmt,
  beritaharian, harianmetro, sinarharian, astroawani,
]

export function getSource(id: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.id === id)
}
