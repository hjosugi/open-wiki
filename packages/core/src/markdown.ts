/**
 * Markdown rendering pipeline — isomorphic (runs in Bun on the server for
 * render-on-save, and in the browser for the live editor preview).
 *
 * Ported in spirit from Wiki.js's `ux/src/renderers/markdown.js`, but as a
 * single pure function returning both the HTML and a structured table of
 * contents, instead of mutating shared renderer state.
 */
import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import hljs from 'highlight.js'
import { slugifyHeading } from './slug.ts'

export interface TocEntry {
  readonly id: string
  readonly text: string
  readonly level: number
}

export interface RenderResult {
  readonly html: string
  readonly toc: TocEntry[]
}

export interface PageLink {
  readonly path: string
  readonly label: string
  readonly kind: 'wikilink' | 'markdown'
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const md: MarkdownIt = new MarkdownIt({
  html: false, // never trust raw HTML in wiki content
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(code, lang): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`
      } catch {
        /* fall through to escaped output */
      }
    }
    return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`
  },
}).use(anchor, {
  slugify: slugifyHeading,
  level: [1, 2, 3],
  tabIndex: false,
})

const headingLevel = (tag: string): number => Number.parseInt(tag.slice(1), 10) || 0

const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

interface LinkToken {
  readonly type: string
  readonly content: string
  readonly children?: LinkToken[] | null
  attrGet(name: string): string | null
}

const isExternalHref = (href: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')

const hrefToPagePath = (href: string): string | null => {
  const clean = href.trim().split('#')[0]?.split('?')[0] ?? ''
  if (!clean || isExternalHref(clean)) return null
  const path = clean.startsWith('/') ? clean.slice(1) : clean.replace(/^\.\//, '')
  if (!path || path.startsWith('_') || path.startsWith('assets/')) return null
  return path
}

const addUniqueLink = (links: PageLink[], seen: Set<string>, link: PageLink): void => {
  if (!link.path || seen.has(`${link.kind}:${link.path}`)) return
  seen.add(`${link.kind}:${link.path}`)
  links.push(link)
}

/**
 * Render Markdown to sanitized HTML and extract a 3-level table of contents in
 * a single parse pass.
 */
export const renderMarkdown = (content: string): RenderResult => {
  const env: Record<string, unknown> = {}
  const tokens = md.parse(content ?? '', env)
  const toc: TocEntry[] = []

  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]
    if (open && open.type === 'heading_open') {
      const level = headingLevel(open.tag)
      if (level >= 1 && level <= 3) {
        const inline = tokens[i + 1]
        toc.push({
          id: open.attrGet('id') ?? '',
          text: inline?.content ?? '',
          level,
        })
      }
    }
  }

  const html = md.renderer.render(tokens, md.options, env)
  return { html, toc }
}

/** Extract internal page links for graph/backlinks features. */
export const extractPageLinks = (content: string): PageLink[] => {
  const links: PageLink[] = []
  const seen = new Set<string>()

  for (const match of (content ?? '').matchAll(WIKI_LINK)) {
    const rawPath = match[1]?.trim() ?? ''
    const label = (match[2]?.trim() || rawPath).trim()
    const path = rawPath
      .split('/')
      .map((segment) => slugifyHeading(segment))
      .filter(Boolean)
      .join('/')
    addUniqueLink(links, seen, { path, label, kind: 'wikilink' })
  }

  const tokens = md.parse(content ?? '', {})
  const visit = (items: readonly LinkToken[]): void => {
    for (const token of items) {
      if (token.type === 'link_open') {
        const href = token.attrGet('href')
        const path = href ? hrefToPagePath(href) : null
        if (path) {
          const normalized = path
            .split('/')
            .map((segment) => slugifyHeading(segment))
            .filter(Boolean)
            .join('/')
          addUniqueLink(links, seen, { path: normalized, label: path, kind: 'markdown' })
        }
      }
      if (token.children?.length) visit(token.children)
    }
  }
  visit(tokens as LinkToken[])

  return links
}

/** Strip Markdown/HTML to plain text — used for search indexing & descriptions. */
export const toPlainText = (content: string): string =>
  renderMarkdown(content)
    .html.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Build a short plain-text summary (auto-description when none is provided). */
export const summarize = (content: string, maxLength = 200): string => {
  const text = toPlainText(content)
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…'
}
