import { describe, expect, test } from 'bun:test'
import {
  can,
  normalizePath,
  renderMarkdown,
  extractPageLinks,
  slugifyHeading,
  toPlainText,
  validatePageInput,
  isOk,
  isErr,
} from './index.ts'

describe('slug', () => {
  test('normalizes a multi-segment path', () => {
    expect(normalizePath('  Docs / Getting Started ')).toBe('docs/getting-started')
  })
  test('keeps unicode (Japanese) letters', () => {
    expect(normalizePath('ガイド/はじめに')).toBe('ガイド/はじめに')
  })
  test('collapses unsafe characters and edge dashes', () => {
    expect(slugifyHeading('Hello, World!! ')).toBe('hello-world')
  })
})

describe('markdown', () => {
  test('renders headings with ids and extracts a TOC', () => {
    const { html, toc } = renderMarkdown('# Title\n\n## Section A\n\ntext')
    expect(html).toContain('id="title"')
    expect(toc).toEqual([
      { id: 'title', text: 'Title', level: 1 },
      { id: 'section-a', text: 'Section A', level: 2 },
    ])
  })
  test('does not pass through raw HTML', () => {
    const { html } = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
  })
  test('toPlainText strips formatting', () => {
    expect(toPlainText('# Hi\n\n**bold** and `code`')).toBe('Hi bold and code')
  })
  test('extracts wiki and markdown page links', () => {
    expect(extractPageLinks('See [[Docs/Intro|intro]] and [Guide](/guide/start?q=1#top).')).toEqual([
      { path: 'docs/intro', label: 'intro', kind: 'wikilink' },
      { path: 'guide/start', label: 'guide/start', kind: 'markdown' },
    ])
  })
  test('ignores external and asset links in page link extraction', () => {
    expect(extractPageLinks('[Site](https://example.com) ![Image](/assets/a.png) [Hash](#part)')).toEqual([])
  })
  test('renders calendar event fences as event cards', () => {
    const { html } = renderMarkdown(`\`\`\`event
title: Product review
start: 2026-06-20 10:00
end: 2026-06-20 10:30
timezone: Asia/Tokyo
location: Zoom
url: https://example.com/meeting
description: Weekly checkpoint
\`\`\``)

    expect(html).toContain('wiki-event-card')
    expect(html).toContain('Product review')
    expect(html).toContain('Google Calendar')
    expect(html).toContain('Download .ics')
    expect(html).toContain('20260620T100000%2F20260620T103000')
  })
})

describe('permissions', () => {
  test('anonymous can only read', () => {
    expect(can(null, 'page:read')).toBe(true)
    expect(can(null, 'page:write')).toBe(false)
  })
  test('editor can write but not access admin', () => {
    const editor = { id: '1', role: 'editor' as const }
    expect(can(editor, 'page:write')).toBe(true)
    expect(can(editor, 'admin:access')).toBe(false)
  })
  test('admin can do everything', () => {
    const admin = { id: '1', role: 'admin' as const }
    expect(can(admin, 'admin:access')).toBe(true)
  })
})

describe('page validation', () => {
  test('accepts and normalizes valid input', () => {
    const r = validatePageInput({ path: 'Docs/Intro', title: 'Intro', content: 'hello world' })
    expect(isOk(r)).toBe(true)
    if (isOk(r)) {
      expect(r.value.path).toBe('docs/intro')
      expect(r.value.description).toBe('hello world')
    }
  })
  test('rejects empty title', () => {
    const r = validatePageInput({ path: 'x', title: '   ', content: 'y' })
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.field).toBe('title')
  })
  test('rejects empty path', () => {
    const r = validatePageInput({ path: '///', title: 'T', content: 'y' })
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error.field).toBe('path')
  })
})
