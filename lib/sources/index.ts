import type { SourceDefinition } from '@/lib/types'
import { malaysiakini } from './malaysiakini'

export const SOURCES: SourceDefinition[] = [
  malaysiakini,
]

export function getSource(id: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.id === id)
}
