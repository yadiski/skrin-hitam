const MODEL = 'anthropic/claude-haiku-4.5'
const MAX_BODY = 8000
const MIN_BODY = 200
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const SYSTEM_PROMPT = `You summarize Malaysian news articles in 2-3 sentences of neutral English.
Focus on: who did what, when, and key quotes if any. Avoid editorializing or adding information
not present in the article. If the article is written in Bahasa Malaysia, still summarize in English.`

export async function summarize(input: { title: string; body: string }): Promise<string | null> {
  const body = (input.body ?? '').trim()
  if (body.length < MIN_BODY) return null
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')

  const truncated = body.slice(0, MAX_BODY)
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/yadiski/skrin-hitam',
      'X-Title': 'Skrin Hitam by Payong Legam Malaysia',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${input.title}\n\n${truncated}` },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 200)}`)
  }

  const data: { choices?: Array<{ message?: { content?: string } }> } = await res.json()
  const content = data.choices?.[0]?.message?.content
  return content ? content.trim() : null
}
