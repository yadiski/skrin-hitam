const TRACKING_PREFIXES = ['utm_']
const TRACKING_KEYS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', '_ga', 'yclid'])

export function canonicalizeUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  url.hostname = url.hostname.toLowerCase()
  url.hash = ''

  const params = new URLSearchParams()
  // Sort for deterministic output
  const entries = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PREFIXES.some((p) => k.toLowerCase().startsWith(p)))
    .filter(([k]) => !TRACKING_KEYS.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  for (const [k, v] of entries) params.append(k, v)
  url.search = params.toString()

  // Strip trailing slash except for root
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }

  return url.toString()
}
