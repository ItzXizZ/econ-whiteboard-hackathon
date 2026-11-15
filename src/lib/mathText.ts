/**
 * Telling real math apart from money.
 *
 * Economics answers are full of prices ("$6 per unit", "between $4 and $8"),
 * and a "$" is also the inline-math delimiter. Treating every pair of dollar
 * signs as a formula turns whole sentences into italic, space-less KaTeX
 * ("6ontheverticalaxisand..."). These helpers decide which "$...$" spans are
 * formulas and leave the rest as plain text.
 */

/** True when the text between two "$" reads like a formula, not prose with prices. */
export function looksLikeMath(content: string): boolean {
  const c = content
  if (!c.trim() || c.length > 80) return false
  // Real inline math hugs its delimiters: "$ 6 and $" is two prices.
  if (/^\s|\s$/.test(c)) return false
  // "$5 per unit and $" / "$6 on the vertical axis ... $": a price, then words.
  if (/^\d[\d,.]*\s+[A-Za-z]{2,}/.test(c)) return false
  // Three plain words in a row is a sentence, whatever else is in there.
  if (/(?:^|\s)[A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}(?:\s|$)/.test(c.replace(/\\[a-zA-Z]+\{[^{}]*\}/g, ''))) return false
  if (/[\\_^={}]/.test(c)) return true
  // No math syntax at all: only short symbol/number runs count ("2P", "x + 3").
  if (/\b[a-z]{4,}\b/.test(c)) return false
  return /^[\w\s+\-*/().,<>%]{1,30}$/.test(c)
}

export type DollarPiece = { kind: 'text'; text: string } | { kind: 'math'; tex: string }

/**
 * Split text on single-dollar math spans, keeping currency dollars as text.
 * "$$" display math is not handled here; callers deal with it first.
 */
export function splitDollarMath(text: string): DollarPiece[] {
  const out: DollarPiece[] = []
  let buf = ''
  let i = 0
  const flush = () => {
    if (buf) out.push({ kind: 'text', text: buf })
    buf = ''
  }
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && text[i + 1] === '$') {
      buf += '$'
      i += 2
      continue
    }
    if (ch !== '$') {
      buf += ch
      i++
      continue
    }
    // Find the partner on the same line.
    let j = i + 1
    while (j < text.length && text[j] !== '$' && text[j] !== '\n') j++
    const body = j < text.length && text[j] === '$' ? text.slice(i + 1, j) : null
    if (body !== null && looksLikeMath(body)) {
      flush()
      out.push({ kind: 'math', tex: body.trim() })
      i = j + 1
    } else {
      buf += '$'
      i++
    }
  }
  flush()
  return out
}

/** For markdown + remark-math: escape every "$" that is money, keep real math. */
export function escapeCurrencyDollars(text: string): string {
  // Leave fenced code and $$display$$ blocks alone.
  return text
    .split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g)
    .map((part, idx) =>
      idx % 2 === 1
        ? part
        : splitDollarMath(part)
            .map((p) => (p.kind === 'math' ? `$${p.tex}$` : p.text.replace(/\$/g, '\\$')))
            .join('')
    )
    .join('')
}
