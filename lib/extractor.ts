import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export type ExtractResult = {
  title: string
  text: string
}

export function extractArticle(html: string, url: string): ExtractResult {
  try {
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article) return { title: '', text: '' }
    return {
      title: (article.title ?? '').trim(),
      text: (article.textContent ?? '').trim().replace(/\s+/g, ' '),
    }
  } catch {
    return { title: '', text: '' }
  }
}
