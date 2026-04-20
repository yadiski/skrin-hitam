import { describe, test, expect } from 'vitest'
import { matchText, type MatcherEntity } from '@/lib/matcher'

const MUDA: MatcherEntity = {
  slug: 'muda',
  keywords: ['muda', 'parti muda'],
  requireAny: [],
  kind: 'scope',
}

const LUQMAN: MatcherEntity = {
  slug: 'luqman-long',
  keywords: ['luqman long', 'luqman bin long', 'lokman long'],
  requireAny: ['muda', 'parti muda'],
  kind: 'tag',
}

describe('matchText — scope matching', () => {
  test('matches MUDA on plain mention', () => {
    const r = matchText('Parti MUDA launches new policy', [MUDA])
    expect(r.scope).toEqual(['muda'])
    expect(r.matchedKeywords).toContain('parti muda')
  })

  test('does not match MUDA on unrelated word starting with muda', () => {
    const r = matchText('Mudah sekali untuk belajar', [MUDA])
    expect(r.scope).toEqual([])
  })

  test('case insensitive', () => {
    const r = matchText('MUDA press conference', [MUDA])
    expect(r.scope).toEqual(['muda'])
  })
})

describe('matchText — tag with require_any (context gate)', () => {
  test('tags Luqman when MUDA also mentioned', () => {
    const r = matchText('YB Luqman Long speaks at MUDA event', [MUDA, LUQMAN])
    expect(r.scope).toEqual(['muda'])
    expect(r.tag).toEqual(['luqman-long'])
  })

  test('does NOT tag Luqman if MUDA context missing', () => {
    const r = matchText('Luqman Long opens new restaurant', [MUDA, LUQMAN])
    expect(r.scope).toEqual([])
    expect(r.tag).toEqual([])
  })

  test('honorific Dato is stripped', () => {
    const r = matchText("Dato' Luqman Long attends Parti MUDA AGM", [MUDA, LUQMAN])
    expect(r.tag).toEqual(['luqman-long'])
  })

  test('skip-word tolerance: "Luqman bin Long" matches "Luqman Long"', () => {
    const r = matchText('Mohd Luqman bin Long addressed Parti MUDA', [MUDA, LUQMAN])
    expect(r.tag).toEqual(['luqman-long'])
  })

  test('Lokman Long typo variant', () => {
    const r = matchText('Lokman Long of MUDA disagrees', [MUDA, LUQMAN])
    expect(r.tag).toEqual(['luqman-long'])
  })

  test('different Luqman in MUDA article: no tag', () => {
    const r = matchText('Luqman bin Ahmad of MUDA to run for Selangor seat', [MUDA, LUQMAN])
    expect(r.scope).toEqual(['muda'])
    expect(r.tag).toEqual([])
  })
})

describe('matchText — utilities', () => {
  test('empty entities list returns empty result', () => {
    const r = matchText('anything', [])
    expect(r.scope).toEqual([])
    expect(r.tag).toEqual([])
  })

  test('normalizes whitespace', () => {
    const r = matchText('Parti   MUDA\n\nlaunches', [MUDA])
    expect(r.scope).toEqual(['muda'])
  })
})
