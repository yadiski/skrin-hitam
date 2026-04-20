import Parser from 'rss-parser'

export type RssItem = {
  title: string
  url: string
  snippet: string
  publishedAt: Date | null
  guid?: string
}

export type FetchFeedResult =
  | { status: 'ok'; items: RssItem[]; lastModified?: string; etag?: string }
  | { status: 'not_modified' }
  | { status: 'error'; error: string }

const parser = new Parser({ timeout: 10_000 })
const USER_AGENT = 'MudaNewsMonitorBot/1.0 (+https://muda-news-monitor.vercel.app)'

export async function fetchFeed(
  url: string,
  opts: { ifModifiedSince?: string; etag?: string } = {},
): Promise<FetchFeedResult> {
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml;q=0.9' }
  if (opts.ifModifiedSince) headers['if-modified-since'] = opts.ifModifiedSince
  if (opts.etag) headers['if-none-match'] = opts.etag

  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) }
  }

  if (res.status === 304) return { status: 'not_modified' }
  if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` }

  const xml = await res.text()
  let parsed: Parser.Output<unknown>
  try {
    parsed = await parser.parseString(xml)
  } catch (e) {
    return { status: 'error', error: `Parse: ${e instanceof Error ? e.message : String(e)}` }
  }

  const items: RssItem[] = (parsed.items ?? []).map((i) => ({
    title: (i.title ?? '').trim(),
    url: (i.link ?? '').trim(),
    snippet: (i.contentSnippet ?? i.content ?? '').trim().slice(0, 500),
    publishedAt: i.isoDate ? new Date(i.isoDate) : (i.pubDate ? new Date(i.pubDate) : null),
    guid: i.guid,
  })).filter((i) => i.title && i.url)

  return {
    status: 'ok',
    items,
    lastModified: res.headers.get('last-modified') ?? undefined,
    etag: res.headers.get('etag') ?? undefined,
  }
}
