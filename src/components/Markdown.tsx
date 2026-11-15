import { memo } from 'react'

import ReactMarkdown from 'react-markdown'

import remarkGfm from 'remark-gfm'

import remarkMath from 'remark-math'

import rehypeKatex from 'rehype-katex'

import { escapeCurrencyDollars } from '../lib/mathText'

/** Models often run a heading or list item onto the previous line; restore the breaks. */
function repairMarkdownLineBreaks(text: string): string {
  return text
    .replace(/([^\n])\s+(#{1,6}\s)/g, '$1\n\n$2')
    .replace(/([^\n])\s+(-\s+)/g, '$1\n$2')
    .replace(/([^\n])\s+(\*\s+)/g, '$1\n$2')
}



interface MarkdownProps {

  children: string

  className?: string

  /** Tailwind text-size class applied to body text, e.g. "text-xs" */

  size?: string

  /** When provided, link clicks call this instead of navigating (exploration mode). */

  onLinkClick?: (url: string, x: number, y: number, linkText?: string) => void

}



/**

 * Models commonly emit LaTeX with \( \) and \[ \] delimiters in addition to

 * $ and $$. remark-math only understands the dollar form, so normalise first.

 */

function normalizeMath(input: string): string {
  const delimited = input
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => `\n$$\n${body.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body.trim()}$`)
  // Prices like "$6" must not open a math span ("$6 ... $8" would swallow the sentence).
  return escapeCurrencyDollars(delimited)
}

function MarkdownImpl({ children, className = '', size = 'text-sm', onLinkClick }: MarkdownProps) {

  return (

    <div className={`scribe-md ${size} ${className}`}>

      <ReactMarkdown

        remarkPlugins={[remarkGfm, remarkMath]}

        rehypePlugins={[rehypeKatex]}

        components={{

          a: ({ node, href, children: linkChildren, ...props }) => {

            const extractText = (c: React.ReactNode): string => {

              if (typeof c === 'string') return c

              if (typeof c === 'number') return String(c)

              if (Array.isArray(c)) return c.map(extractText).join('')

              if (c && typeof c === 'object' && 'props' in (c as object)) {

                return extractText((c as React.ReactElement).props.children)

              }

              return ''

            }

            const linkText = extractText(linkChildren)

            return (

              <a

                {...props}

                href={href}

                target={onLinkClick ? undefined : '_blank'}

                rel="noopener noreferrer"

                onClick={

                  onLinkClick && href

                    ? (e) => {

                        e.preventDefault()

                        e.stopPropagation()

                        onLinkClick(href, e.clientX, e.clientY, linkText || undefined)

                      }

                    : undefined

                }

              >

                {linkChildren}

              </a>

            )

          },

          code: ({ node, className: cls, children, ...props }) => {

            const isBlock = /language-/.test(cls || '')

            if (isBlock) {

              return (

                <code className={`scribe-code-block ${cls || ''}`} {...props}>

                  {children}

                </code>

              )

            }

            return (

              <code className="scribe-code-inline" {...props}>

                {children}

              </code>

            )

          },

        }}

      >

        {normalizeMath(repairMarkdownLineBreaks(children))}

      </ReactMarkdown>

    </div>

  )

}



export default memo(MarkdownImpl)

