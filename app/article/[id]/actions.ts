'use server'
import { db, schema } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function reportMismatch(formData: FormData) {
  const id = String(formData.get('id'))
  await db.update(schema.articles).set({ falsePositive: true }).where(eq(schema.articles.id, id))
  revalidatePath('/')
  revalidatePath(`/article/${id}`)
}
