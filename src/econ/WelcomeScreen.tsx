import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ImagePlus, LineChart, MessageCircle, Sparkles } from 'lucide-react'
import { TOGETHER_LESSONS } from '../lib/drawTogether'
import adamPortrait from '../math/assets/talking-frames/frame-01.png'

const LESSON_CHOICES = [
  { id: 'supply-demand', label: 'Supply & demand' },
  { id: 'ppf', label: 'PPF' },
  { id: 'fx', label: 'Currency market' },
  { id: 'loanable-funds', label: 'Loanable funds' },
  { id: 'bonds', label: 'Bond market' },
].filter((choice) => TOGETHER_LESSONS.some((lesson) => lesson.id === choice.id))

export default function WelcomeScreen({
  showMicHint,
  onDismiss,
  onUploadFile,
  onAskQuestion,
  onStartLesson,
}: {
  showMicHint: boolean
  onDismiss: () => void
  onUploadFile: (file: File) => void
  onAskQuestion: () => void
  onStartLesson: (lessonId: string) => void
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const uploadRef = useRef<HTMLInputElement | null>(null)
  const [lessonsOpen, setLessonsOpen] = useState(false)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not(.econ-welcome-file-input), [href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element.offsetParent !== null)
    focusable()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [onDismiss])

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onUploadFile(file)
    event.target.value = ''
  }

  return (
    <div className="econ-welcome">
      <div
        ref={dialogRef}
        className="econ-welcome-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="econ-welcome-title"
        tabIndex={-1}
      >
        <svg className="econ-welcome-graph" viewBox="0 0 820 360" aria-hidden="true">
          <path className="econ-welcome-graph-axis" pathLength={1} d="M78 48 V286 H746" />
          <path className="econ-welcome-graph-line is-demand" pathLength={1} d="M144 82 L674 252" />
          <path className="econ-welcome-graph-line is-supply" pathLength={1} d="M142 258 L674 92" />
        </svg>

        <div className="econ-welcome-content">
          <header className="econ-welcome-hero">
            <div className="econ-welcome-portrait-wrap">
              <img src={adamPortrait} alt="Adam" className="econ-welcome-portrait" />
              <span className="econ-welcome-sparkle" aria-hidden="true">
                <Sparkles size={16} />
              </span>
            </div>
            <div className="econ-welcome-intro">
              <p className="econ-welcome-eyebrow">YOUR ON-DEVICE ECONOMICS TUTOR</p>
              <h1 id="econ-welcome-title">Hi, I&apos;m Adam.</h1>
              <p className="econ-welcome-subtitle">
                Give me a problem or a worksheet and I&apos;ll walk you through it, as much or as little as
                you need.
              </p>
              <p className="econ-welcome-tagline">
                The AI tutor that teaches you, instead of doing it for you.
              </p>
            </div>
          </header>

          <div className="econ-welcome-actions" aria-label="Choose how to begin">
            <div className="econ-welcome-action">
              <button
                type="button"
                className="econ-welcome-action-main"
                onClick={() => uploadRef.current?.click()}
              >
                <span className="econ-welcome-action-icon" aria-hidden="true">
                  <ImagePlus size={22} />
                </span>
                <span className="econ-welcome-action-copy">
                  <strong>Upload a worksheet</strong>
                  <span>Take a photo or choose an image</span>
                </span>
                <ChevronRight className="econ-welcome-action-arrow" size={18} aria-hidden="true" />
              </button>
              <input
                ref={uploadRef}
                className="econ-welcome-file-input"
                type="file"
                accept="image/*"
                aria-label="Choose a worksheet image"
                onChange={handleFile}
              />
            </div>

            <div className="econ-welcome-action">
              <button type="button" className="econ-welcome-action-main" onClick={onAskQuestion}>
                <span className="econ-welcome-action-icon" aria-hidden="true">
                  <MessageCircle size={22} />
                </span>
                <span className="econ-welcome-action-copy">
                  <strong>Ask a question</strong>
                  <span>
                    {showMicHint ? 'Type a question or ask out loud' : 'Ask about anything on your board'}
                  </span>
                </span>
                <ChevronRight className="econ-welcome-action-arrow" size={18} aria-hidden="true" />
              </button>
            </div>

            <div className={`econ-welcome-action${lessonsOpen ? ' is-expanded' : ''}`}>
              <button
                type="button"
                className="econ-welcome-action-main"
                onClick={() => setLessonsOpen((open) => !open)}
                aria-expanded={lessonsOpen}
              >
                <span className="econ-welcome-action-icon" aria-hidden="true">
                  <LineChart size={22} />
                </span>
                <span className="econ-welcome-action-copy">
                  <strong>Draw a graph with me</strong>
                  <span>Choose a lesson to draw together</span>
                </span>
                <ChevronDown
                  className={`econ-welcome-action-arrow${lessonsOpen ? ' is-open' : ''}`}
                  size={18}
                  aria-hidden="true"
                />
              </button>
              {lessonsOpen && (
                <div className="econ-welcome-lessons" aria-label="Draw-with-Adam lessons">
                  {LESSON_CHOICES.map((lesson) => (
                    <button
                      type="button"
                      key={lesson.id}
                      onClick={() => onStartLesson(lesson.id)}
                    >
                      {lesson.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button type="button" className="econ-welcome-blank" onClick={onDismiss}>
            Start with a blank board
          </button>
          <p className="econ-welcome-footer">Runs entirely on this device · Bonsai-2 · Argmax · works offline</p>
        </div>
      </div>
    </div>
  )
}
