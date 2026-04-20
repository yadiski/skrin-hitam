import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_BODY = 8000
const MIN_BODY = 200

const SYSTEM_PROMPT = `You summarize Malaysian news articles in 2-3 sentences of neutral English.
Focus on: who did what, when, and key quotes if any. Avoid editorializing or adding information
not present in the article. If the article is written in Bahasa Malaysia, still summarize in English.`

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    client = new Anthropic({ apiKey })
  }
  return client
}

export async function summarize(input: { title: string; body: string }): Promise<string | null> {
  const body = (input.body ?? '').trim()
  if (body.length < MIN_BODY) return null
  const truncated = body.slice(0, MAX_BODY)
  const userContent = `${input.title}\n\n${truncated}`

  const msg = await getClient().messages.create({
    model: MODEL,
    max_tokens: 300,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  })

  const first = msg.content.find((b) => b.type === 'text')
  return first && first.type === 'text' ? first.text.trim() : null
}
