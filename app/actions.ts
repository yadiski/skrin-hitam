'use server'
import { fetchColumnArticles, type ArticleRow, type Filter, type SortMode } from '@/lib/articles-query'

export async function loadMoreForColumn(
  entitySlug: string,
  offset: number,
  globalFilter: Filter,
  columnFilter: Filter,
  sort: SortMode,
  limit = 25,
): Promise<ArticleRow[]> {
  return fetchColumnArticles(entitySlug, globalFilter, columnFilter, sort, offset, limit)
}
