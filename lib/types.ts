export type Language = 'en' | 'ms'

export type SourceDefinition = {
  id: string
  name: string
  rssUrl: string
  baseUrl: string
  language: Language
  // Fallback selectors for Readability failures; optional.
  articleSelector?: string
}

export type TrackedEntityInput = {
  slug: string
  name: string
  keywords: string[]
  requireAny: string[]
  kind: 'scope' | 'tag'
  color: string
}
