'use server'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { runRematchAllArticles } from '@/app/api/admin/rematch/route'

function parseList(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

export async function saveEntity(formData: FormData) {
  const id = formData.get('id') as string | null
  const field = formData.get('field') as string | null

  if (!id) {
    await db.insert(schema.trackedEntities).values({
      slug: String(formData.get('slug')).toLowerCase().trim(),
      name: String(formData.get('name')).trim(),
      kind: (formData.get('kind') as 'scope' | 'tag') ?? 'tag',
      keywords: parseList(formData.get('keywords')),
      requireAny: parseList(formData.get('requireAny')),
      color: String(formData.get('color') ?? '#3b82f6'),
    })
  } else if (field === 'keywords') {
    await db.update(schema.trackedEntities).set({ keywords: parseList(formData.get('keywords')), updatedAt: new Date() }).where(eq(schema.trackedEntities.id, id))
  } else if (field === 'requireAny') {
    await db.update(schema.trackedEntities).set({ requireAny: parseList(formData.get('requireAny')), updatedAt: new Date() }).where(eq(schema.trackedEntities.id, id))
  } else if (field === 'enabled') {
    await db.update(schema.trackedEntities).set({ enabled: formData.get('enabled') === 'on', updatedAt: new Date() }).where(eq(schema.trackedEntities.id, id))
  } else {
    await db.update(schema.trackedEntities).set({ name: String(formData.get('name')).trim(), updatedAt: new Date() }).where(eq(schema.trackedEntities.id, id))
  }

  revalidatePath('/admin/entities')
}

export async function deleteEntity(formData: FormData) {
  const id = String(formData.get('id'))
  await db.delete(schema.trackedEntities).where(eq(schema.trackedEntities.id, id))
  revalidatePath('/admin/entities')
}

export async function triggerRematch() {
  await runRematchAllArticles()
  revalidatePath('/admin/entities')
  revalidatePath('/')
}
