import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractArticle } from '@/lib/extractor'

const html = readFileSync(join(__dirname, '../fixtures/html/simple-article.html'), 'utf8')

describe('extractArticle', () => {
  test('extracts title and body text', () => {
    const result = extractArticle(html, 'https://example.com/a')
    expect(result.title).toContain('Parti MUDA policy speech')
    expect(result.text).toContain('Luqman Long')
    expect(result.text).toContain('youth empowerment')
  })

  test('returns null title/text for non-article HTML', () => {
    const stub = '<html><body><div>x</div></body></html>'
    const result = extractArticle(stub, 'https://example.com/a')
    expect(result.text.length).toBeLessThan(200)
  })
})
