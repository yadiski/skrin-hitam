import { describe, test, expect } from 'vitest'
import { canonicalizeUrl } from '@/lib/canonical'

describe('canonicalizeUrl', () => {
  test('strips utm_* params', () => {
    expect(canonicalizeUrl('https://example.com/a?utm_source=x&id=1'))
      .toBe('https://example.com/a?id=1')
  })

  test('strips all utm params, keeping others', () => {
    expect(canonicalizeUrl('https://example.com/a?utm_source=x&utm_medium=y&keep=1'))
      .toBe('https://example.com/a?keep=1')
  })

  test('removes fragment', () => {
    expect(canonicalizeUrl('https://example.com/a#section'))
      .toBe('https://example.com/a')
  })

  test('normalizes trailing slash', () => {
    expect(canonicalizeUrl('https://example.com/a/'))
      .toBe('https://example.com/a')
  })

  test('keeps root trailing slash', () => {
    expect(canonicalizeUrl('https://example.com/'))
      .toBe('https://example.com/')
  })

  test('lowercases host', () => {
    expect(canonicalizeUrl('https://Example.COM/path'))
      .toBe('https://example.com/path')
  })

  test('strips fbclid and gclid', () => {
    expect(canonicalizeUrl('https://example.com/a?fbclid=x&gclid=y&z=1'))
      .toBe('https://example.com/a?z=1')
  })

  test('sorts query params for stable dedupe', () => {
    expect(canonicalizeUrl('https://example.com/a?b=2&a=1'))
      .toBe('https://example.com/a?a=1&b=2')
  })

  test('returns null for invalid url', () => {
    expect(canonicalizeUrl('not a url')).toBe(null)
  })
})
