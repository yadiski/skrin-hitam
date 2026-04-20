import { db, schema } from '@/lib/db/client'
import { asc } from 'drizzle-orm'
import { saveEntity, deleteEntity, triggerRematch } from './actions'

export default async function EntitiesPage() {
  const entities = await db.select().from(schema.trackedEntities).orderBy(asc(schema.trackedEntities.slug))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tracked entities</h1>
        <form action={triggerRematch}>
          <button type="submit" className="text-sm border border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-800">
            Re-match all articles
          </button>
        </form>
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="text-left px-3 py-2">Slug</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Kind</th>
              <th className="text-left px-3 py-2">Keywords</th>
              <th className="text-left px-3 py-2">Require any</th>
              <th className="text-left px-3 py-2">Enabled</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 font-mono text-xs">{e.slug}</td>
                <td className="px-3 py-2">
                  <form action={saveEntity} className="contents">
                    <input type="hidden" name="id" value={e.id} />
                    <input name="name" defaultValue={e.name} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full" />
                  </form>
                </td>
                <td className="px-3 py-2">{e.kind}</td>
                <td className="px-3 py-2">
                  <form action={saveEntity} className="contents">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="field" value="keywords" />
                    <input name="keywords" defaultValue={e.keywords.join(', ')} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full" />
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={saveEntity} className="contents">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="field" value="requireAny" />
                    <input name="requireAny" defaultValue={e.requireAny.join(', ')} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full" />
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={saveEntity}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="field" value="enabled" />
                    <input name="enabled" type="checkbox" defaultChecked={e.enabled} />
                  </form>
                </td>
                <td className="px-3 py-2">
                  <form action={deleteEntity}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="text-red-400 hover:text-red-300">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewEntityForm />
    </div>
  )
}

function NewEntityForm() {
  return (
    <form action={saveEntity} className="border border-neutral-800 rounded-lg p-4 space-y-3 max-w-xl">
      <h2 className="font-semibold">New entity</h2>
      <input name="slug" placeholder="slug (e.g., syed-saddiq)" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" required />
      <input name="name" placeholder="Display name" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" required />
      <select name="kind" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1">
        <option value="tag">tag (label on scoped articles)</option>
        <option value="scope">scope (extends the DB corpus)</option>
      </select>
      <input name="keywords" placeholder="keywords, comma-separated" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" required />
      <input name="requireAny" placeholder="require-any, comma-separated (optional)" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" />
      <input name="color" defaultValue="#3b82f6" className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1" />
      <button type="submit" className="bg-orange-500 text-black rounded px-3 py-1.5 font-semibold">Create</button>
    </form>
  )
}
