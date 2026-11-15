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
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  )

  useEffect(() => {
    const updateVisibility = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

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
    <div className={`econ-welcome${tabVisible ? '' : ' is-paused'}`}>
      <div
        ref={dialogRef}
        className="econ-welcome-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="econ-welcome-title"
        tabIndex={-1}
      >
        <div className="econ-welcome-layout">
          <div className="econ-welcome-main">
            <header className="econ-welcome-hero">
              <div className="econ-welcome-portrait-wrap">
                <img src={adamPortrait} alt="Adam" className="econ-welcome-portrait" />
                <span className="econ-welcome-sparkle" aria-hidden="true">
                  <Sparkles size={16} />
                </span>
              </div>
              <div className="econ-welcome-intro">
                <p className="econ-welcome-eyebrow">YOUR ON-DEVICE ECONOMICS TUTOR</p>
                <h1 id="econ-welcome-title">Draw economics with a tutor that draws back.</h1>
                <p className="econ-welcome-subtitle">
                  Adam reads your problem, draws with you, and fixes mistakes on the board. Runs
                  entirely on this laptop, no WiFi needed.
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

            <div className="econ-welcome-secondary">
              <button type="button" className="econ-welcome-blank" onClick={onDismiss}>
                Start with a blank board
              </button>
              <p className="econ-welcome-footer">On-device · Bonsai-2 · Argmax</p>
            </div>
          </div>

          <div className="econ-welcome-demo" aria-hidden="true">
            <div className="econ-welcome-demo-kicker">A little of how we work</div>
            <svg viewBox="0 0 440 300" className="econ-welcome-demo-board">
              <defs>
                <pattern id="econ-welcome-dots" width="18" height="18" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="rgba(83, 78, 120, 0.12)" />
                </pattern>
                <linearGradient id="econ-welcome-sweep" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#8e84ef" stopOpacity="0" />
                  <stop offset="0.5" stopColor="#8e84ef" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#8e84ef" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect width="440" height="300" rx="20" fill="url(#econ-welcome-dots)" />
              <path className="econ-welcome-demo-axis" pathLength={1} d="M66 45 V242 H390" />
              <path
                className="econ-welcome-demo-demand-sketch"
                pathLength={1}
                d="M96 72 C126 78 139 111 171 116 S223 145 253 151 S319 172 359 198"
              />
              <path
                className="econ-welcome-demo-demand-clean"
                pathLength={1}
                d="M96 74 L359 198"
              />
              <path
                className="econ-welcome-demo-supply-wrong"
                pathLength={1}
                d="M96 202 C151 184 190 164 237 155 S310 121 359 91"
              />
              <path
                className="econ-welcome-demo-supply-highlight"
                d="M96 202 C151 184 190 164 237 155 S310 121 359 91"
              />
              <path
                className="econ-welcome-demo-supply-clean"
                pathLength={1}
                d="M96 202 L359 91"
              />
              <path className="econ-welcome-demo-success-flash" d="M96 202 L359 91" />
              <circle className="econ-welcome-demo-equilibrium" cx="230" cy="137" r="6" />
              <g className="econ-welcome-demo-cursor">
                <circle r="13" fill="rgba(91, 82, 195, 0.12)" />
                <path d="M-3 -10 8 3 2 3 0 9 -3 8 -1 2 -6 3Z" />
              </g>
            </svg>
            <div className="econ-welcome-demo-check">
              <span>✓</span> Nice work
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
