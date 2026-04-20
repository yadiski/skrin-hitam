import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

// Lazily create the drizzle client so that test files can safely import this
// module (and use `describe.skip`) even when DATABASE_URL is not set.
// The error is deferred to the first actual query, not import time.
let _db: NeonHttpDatabase<typeof schema> | undefined

export const db: NeonHttpDatabase<typeof schema> = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!_db) {
      const url = process.env.DATABASE_URL
      if (!url) throw new Error('DATABASE_URL is required')
      _db = drizzle(neon(url), { schema })
    }
    return Reflect.get(_db, prop, receiver)
  },
})

export { schema }
