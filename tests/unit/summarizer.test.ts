import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { summarize } from '@/lib/summarizer'

describe('summarize', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('returns summary text on success', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'A short summary.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const s = await summarize({ title: 'Title', body: 'A long article body with enough content.'.repeat(20) })
    expect(s).toBe('A short summary.')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('anthropic/claude-haiku-4.5')
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
  })

  test('returns null when body is too short', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const s = await summarize({ title: 'T', body: 'short' })
    expect(s).toBe(null)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('truncates body to 8000 chars in user message', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await summarize({ title: 'T', body: 'x'.repeat(20_000) })
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const body = JSON.parse(init.body as string)
    const userContent: string = body.messages[1].content
    expect(userContent.length).toBeLessThanOrEqual(8000 + 'T'.length + 10)
  })

  test('throws on API error (caller decides retry)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate_limit', { status: 429 })))
    await expect(summarize({ title: 'T', body: 'long body '.repeat(30) })).rejects.toThrow(/OpenRouter 429/)
  })
})
