import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { summarize } from '@/lib/summarizer'

const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
  },
}))

describe('summarize', () => {
  beforeEach(() => {
    createMock.mockReset()
    process.env.ANTHROPIC_API_KEY = 'test'
  })
  afterEach(() => { vi.restoreAllMocks() })

  test('returns summary text on success', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'A short summary.' }] })
    const s = await summarize({ title: 'Title', body: 'A long article body with enough content.'.repeat(20) })
    expect(s).toBe('A short summary.')
    expect(createMock).toHaveBeenCalled()
    const call = createMock.mock.calls[0][0]
    expect(call.model).toBe('claude-haiku-4-5-20251001')
    expect(call.system).toBeDefined()
    // Cache control on system prompt
    expect(Array.isArray(call.system) ? call.system[0].cache_control : call.system)
      .toBeTruthy()
  })

  test('returns null when body is too short', async () => {
    const s = await summarize({ title: 'T', body: 'short' })
    expect(s).toBe(null)
    expect(createMock).not.toHaveBeenCalled()
  })

  test('truncates body to 8000 chars in user message', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    await summarize({ title: 'T', body: 'x'.repeat(20_000) })
    const userContent = createMock.mock.calls[0][0].messages[0].content
    expect(userContent.length).toBeLessThanOrEqual(8000 + 'T'.length + 10)
  })

  test('throws on API error (caller decides retry)', async () => {
    createMock.mockRejectedValue(new Error('rate_limit'))
    await expect(summarize({ title: 'T', body: 'long body '.repeat(30) })).rejects.toThrow('rate_limit')
  })
})
