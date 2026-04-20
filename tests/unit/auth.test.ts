import { describe, test, expect, beforeEach } from 'vitest'
import { signToken, verifyToken } from '@/lib/auth'

beforeEach(() => { process.env.ADMIN_COOKIE_SECRET = 'a'.repeat(32) })

describe('auth', () => {
  test('signs and verifies a token', async () => {
    const token = await signToken('admin')
    expect(await verifyToken(token)).toBe('admin')
  })

  test('rejects tampered token', async () => {
    const token = await signToken('admin')
    const tampered = token.slice(0, -4) + 'xxxx'
    expect(await verifyToken(tampered)).toBe(null)
  })

  test('rejects expired token', async () => {
    const token = await signToken('admin', -60)  // -60s expiry
    expect(await verifyToken(token)).toBe(null)
  })
})
