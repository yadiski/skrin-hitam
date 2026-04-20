export type MatcherEntity = {
  slug: string
  keywords: string[]
  requireAny: string[]
  kind: 'scope' | 'tag'
}

export type MatchResult = {
  scope: string[]
  tag: string[]
  matchedKeywords: string[]
}

const HONORIFICS = [
  "dato'", 'dato',
  'datuk seri', 'datuk sri', 'datuk',
  'datin', 'tan sri', 'puan sri',
  'tun',
  'yb', 'yab', 'ybhg', 'tuan', 'puan', 'encik', 'sdr', 'sdri',
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalize(text: string): string {
  let t = text
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  for (const h of HONORIFICS) {
    const re = new RegExp(`(^|\\s)${escapeRegex(h)}(?=\\s)`, 'g')
    t = t.replace(re, '$1')
  }
  return t.replace(/\s+/g, ' ').trim()
}

function keywordRegex(keyword: string): RegExp {
  const normalized = keyword.toLowerCase().trim()
  const tokens = normalized.split(/\s+/).map(escapeRegex)
  if (tokens.length === 1) {
    return new RegExp(`\\b${tokens[0]}\\b`, 'i')
  }
  // Multi-word: allow up to 1 filler word between consecutive tokens.
  // e.g. "luqman long" → \bluqman(?:\s+\w{1,5}){0,1}\s+long\b
  // This means "Luqman bin Long" matches, but "Luqman bin Ahmad" does not
  // because the last required token "long" is absent.
  const parts: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    parts.push(tokens[i])
    if (i < tokens.length - 1) {
      // Allow 0 or 1 filler words between this token and the next
      parts.push('(?:\\s+\\w{1,5}){0,1}\\s+')
    }
  }
  const pattern = parts.join('')
  return new RegExp(`\\b${pattern}\\b`, 'i')
}

function anyKeywordMatches(
  text: string,
  keywords: string[],
): { hit: boolean; matchedKeyword?: string } {
  for (const k of keywords) {
    if (keywordRegex(k).test(text)) return { hit: true, matchedKeyword: k.toLowerCase() }
  }
  return { hit: false }
}

export function matchText(text: string, entities: MatcherEntity[]): MatchResult {
  const norm = normalize(text)
  const scope: string[] = []
  const tag: string[] = []
  const matchedKeywords = new Set<string>()

  for (const entity of entities) {
    const hits: string[] = []
    for (const k of entity.keywords) {
      if (keywordRegex(k).test(norm)) hits.push(k.toLowerCase())
    }
    if (hits.length === 0) continue

    if (entity.requireAny.length > 0) {
      const ctx = anyKeywordMatches(norm, entity.requireAny)
      if (!ctx.hit) continue
      if (ctx.matchedKeyword) matchedKeywords.add(ctx.matchedKeyword)
    }

    for (const h of hits) matchedKeywords.add(h)
    if (entity.kind === 'scope') scope.push(entity.slug)
    else tag.push(entity.slug)
  }

  return { scope, tag, matchedKeywords: [...matchedKeywords] }
}
