/**
 * math-render.js — shared KaTeX renderer
 *
 * Converts a plain-text string containing $...$ (inline) and $$...$$ (display)
 * LaTeX delimiters into an HTML string with KaTeX-rendered math.
 *
 * Non-math text is HTML-escaped; newlines are preserved via white-space: pre-wrap
 * on the container element.
 */

import katex from 'katex'
import 'katex/dist/katex.min.css'

const escHtml = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const renderInlineText = s =>
  escHtml(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

function normalizeLatexDisplayBlocks(text) {
  return text
    .replace(/\\\[((?:.|\n)+?)\\\]/g, (_, math) => `$$${math.trim()}$$`)
    .replace(/\\begin\{align\*?\}([\s\S]+?)\\end\{align\*?\}/g, (_, math) =>
      `$$\\begin{aligned}${math.trim()}\\end{aligned}$$`)
    .replace(/\\begin\{equation\*?\}([\s\S]+?)\\end\{equation\*?\}/g, (_, math) =>
      `$$${math.trim()}$$`)
    .replace(/\\begin\{displaymath\}([\s\S]+?)\\end\{displaymath\}/g, (_, math) =>
      `$$${math.trim()}$$`)
}

/**
 * Render a full response string to HTML with KaTeX math.
 * Safe to set as innerHTML — all non-math text is HTML-escaped.
 *
 * @param   {string} text
 * @returns {string} HTML string
 */
export function renderMath(text) {
  if (!text) return ''
  text = normalizeLatexDisplayBlocks(text)

  const parts  = []
  let   cursor = 0

  // Match $$...$$ first (display), then $...$ (inline).
  // Quantifiers are lazy so they stop at the first closing delimiter.
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
  let   m

  while ((m = re.exec(text)) !== null) {
    // Plain text before this match
    if (m.index > cursor) {
      parts.push(renderInlineText(text.slice(cursor, m.index)))
    }

    const display = m[0].startsWith('$$')
    const math    = display ? m[0].slice(2, -2) : m[0].slice(1, -1)

    try {
      parts.push(katex.renderToString(math.trim(), {
        displayMode:  display,
        throwOnError: false,
        strict:       false,
        output:       'html',
      }))
    } catch {
      parts.push(`<code>${escHtml(math)}</code>`)
    }

    cursor = m.index + m[0].length
  }

  // Remaining plain text
  if (cursor < text.length) {
    parts.push(renderInlineText(text.slice(cursor)))
  }

  return parts.join('')
}

function isHeading(line) {
  return /^(#{1,3}\s+|[A-Z][A-Za-z\s/]+:)\S?/.test(line.trim())
}

function cleanHeading(line) {
  return line.trim()
    .replace(/^#{1,3}\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/:$/, '')
}

function isBullet(line) {
  return /^\s*[-*]\s+/.test(line)
}

function isNumbered(line) {
  return /^\s*\d+\.\s+/.test(line)
}

function renderList(lines, ordered) {
  const tag = ordered ? 'ol' : 'ul'
  const items = lines.map(line => {
    const text = line.replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, '')
    return `<li>${renderMath(text.trim())}</li>`
  }).join('')
  return `<${tag} class="ai-study-list">${items}</${tag}>`
}

/**
 * Render AI teaching text as readable study notes.
 *
 * This keeps KaTeX support from renderMath(), then adds a light structural pass
 * for Markdown-style headings, numbered steps, bullets, and compact paragraphs.
 */
export function renderStudyText(text) {
  if (!text?.trim()) return ''

  const normalized = text.replace(/\r\n/g, '\n').trim()
  const blocks = normalized.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)
  const html = []

  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    if (!lines.length) continue

    if (lines.length === 1 && isHeading(lines[0])) {
      html.push(`<h3 class="ai-study-heading">${renderMath(cleanHeading(lines[0]))}</h3>`)
      continue
    }

    if (lines.every(isNumbered)) {
      html.push(renderList(lines, true))
      continue
    }

    if (lines.every(isBullet)) {
      html.push(renderList(lines, false))
      continue
    }

    if (isHeading(lines[0]) && lines.length > 1) {
      html.push(`<h3 class="ai-study-heading">${renderMath(cleanHeading(lines[0]))}</h3>`)
      const rest = lines.slice(1)
      if (rest.every(isNumbered)) {
        html.push(renderList(rest, true))
      } else if (rest.every(isBullet)) {
        html.push(renderList(rest, false))
      } else {
        const body = rest.join('\n')
        html.push(`<p class="ai-study-paragraph">${renderMath(body).replace(/\n/g, '<br>')}</p>`)
      }
      continue
    }

    html.push(`<p class="ai-study-paragraph">${renderMath(block).replace(/\n/g, '<br>')}</p>`)
  }

  return `<article class="ai-study">${html.join('')}</article>`
}
