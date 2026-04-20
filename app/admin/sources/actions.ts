'use server'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function updateSource(formData: FormData) {
  const id = String(formData.get('id'))
  const field = String(formData.get('field'))
  if (field === 'enabled') {
    await db.update(schema.sources).set({ enabled: formData.get('enabled') === 'on', updatedAt: new Date() }).where(eq(schema.sources.id, id))
  } else if (field === 'rssUrl') {
    await db.update(schema.sources).set({ rssUrl: String(formData.get('rssUrl')), updatedAt: new Date() }).where(eq(schema.sources.id, id))
  }
  revalidatePath('/admin/sources')
}
