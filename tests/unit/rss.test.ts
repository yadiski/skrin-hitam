import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchFeed } from '@/lib/rss'

const sample = readFileSync(join(__dirname, '../fixtures/rss/malaysiakini-sample.xml'), 'utf8')

describe('fetchFeed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sample, {
      status: 200,
      headers: { 'content-type': 'application/rss+xml', 'last-modified': 'Mon, 20 Apr 2026 10:00:00 GMT' },
    })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  test('parses items from RSS xml', async () => {
    const result = await fetchFeed('https://example.com/feed.rss')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.items).toHaveLength(2)
    expect(result.items[0].title).toBe('Parti MUDA launches new election push')
    expect(result.items[0].url).toBe('https://www.malaysiakini.com/news/100001')
    expect(result.items[0].publishedAt).toBeInstanceOf(Date)
  })

  test('returns not_modified when server responds 304', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 304, ok: false, headers: new Headers() }) as unknown as Response))
    const result = await fetchFeed('https://example.com/feed.rss', { ifModifiedSince: 'Mon, 20 Apr 2026 10:00:00 GMT' })
    expect(result.status).toBe('not_modified')
  })

  test('returns error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await fetchFeed('https://example.com/feed.rss')
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.error).toContain('ECONNREFUSED')
  })
})
