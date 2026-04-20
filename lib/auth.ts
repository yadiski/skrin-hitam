import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7  // 7 days
const ALGO = 'sha256'

function getSecret(): Buffer {
  const s = process.env.ADMIN_COOKIE_SECRET
  if (!s || s.length < 32) throw new Error('ADMIN_COOKIE_SECRET must be at least 32 chars')
  return Buffer.from(s, 'utf8')
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function fromBase64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export async function signToken(subject: string, ttlSec = DEFAULT_TTL_SEC): Promise<string> {
  const payload = { sub: subject, exp: Math.floor(Date.now() / 1000) + ttlSec }
  const body = base64url(Buffer.from(JSON.stringify(payload)))
  const sig = createHmac(ALGO, getSecret()).update(body).digest()
  return `${body}.${base64url(sig)}`
}

export async function verifyToken(token: string): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = createHmac(ALGO, getSecret()).update(body).digest()
  const given = fromBase64url(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: { sub: string; exp: number }
  try { payload = JSON.parse(fromBase64url(body).toString('utf8')) } catch { return null }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload.sub
}

export function verifyPassword(provided: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? ''
  if (!expected) return false
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const ADMIN_COOKIE_NAME = 'muda_admin'
