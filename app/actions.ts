'use server'
import {
  countArticlesSince,
  fetchArticlesSince,
  fetchColumnArticles,
  type ArticleRow,
  type Filter,
  type SortMode,
} from '@/lib/articles-query'

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

export async function countNewSince(
  entitySlug: string,
  sinceIso: string,
  globalFilter: Filter,
  columnFilter: Filter,
): Promise<number> {
  return countArticlesSince(entitySlug, globalFilter, columnFilter, sinceIso)
}

export async function fetchNewSince(
  entitySlug: string,
  sinceIso: string,
  globalFilter: Filter,
  columnFilter: Filter,
  limit = 25,
): Promise<ArticleRow[]> {
  return fetchArticlesSince(entitySlug, globalFilter, columnFilter, sinceIso, limit)
}
