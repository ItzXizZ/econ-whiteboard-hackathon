/**
 * Voice tutor plumbing. Nothing here leaves the machine by default.
 *
 *   - Speech OUT uses the browser's built-in speechSynthesis, restricted to
 *     voices the OS reports as on-device (`localService`). Sentences are
 *     spoken incrementally as the tutor's reply streams in.
 *   - Speech IN (the mic) is OFF by default. The only speech recognizer a
 *     Windows browser offers is the Web Speech API, and Chrome/Edge implement
 *     it by sending audio to a cloud service, which this project does not
 *     allow. Set VITE_ALLOW_BROWSER_STT=1 to opt in for a demo. On Apple
 *     Silicon / Snapdragon Android the intended on-device engine is Argmax
 *     (see README).
 *
 * The "brain" is the local Bonsai model behind the API server; this file only
 * handles ears and mouth.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { speakableMathText } from './mathSpeech'

export interface RecognizerHandle {
  start: () => void
  stop: () => void
  abort: () => void
}

interface STTCallbacks {
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (err: string) => void
  onEnd?: () => void
  onStart?: () => void
}

const BROWSER_STT_ALLOWED = import.meta.env.VITE_ALLOW_BROWSER_STT === '1'

export function speechRecognitionSupported(): boolean {
  if (!BROWSER_STT_ALLOWED) return false
  return (
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  )
}

/** Create a continuous recognizer. Returns null when voice input is off or unsupported. */
export function createRecognizer(cb: STTCallbacks): RecognizerHandle | null {
  if (!speechRecognitionSupported()) return null
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) return null
  const rec = new SR()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = 'en-US'

  rec.onresult = (e: any) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const txt = (r[0]?.transcript ?? '').trim()
      if (!txt) continue
      if (r.isFinal) cb.onFinal?.(txt)
      else interim += txt + ' '
    }
    if (interim.trim()) cb.onInterim?.(interim.trim())
  }
  rec.onerror = (e: any) => cb.onError?.(String(e?.error || 'speech error'))
  rec.onend = () => cb.onEnd?.()
  rec.onstart = () => cb.onStart?.()

  return {
    start: () => {
      try {
        rec.start()
      } catch {
        /* start() throws if already started */
      }
    },
    stop: () => {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    },
    abort: () => {
      try {
        rec.abort()
      } catch {
        /* ignore */
      }
    },
  }
}

// ── Text-to-speech (browser speechSynthesis, on-device voices only) ─────────

let preferredVoice: SpeechSynthesisVoice | null = null
let ttsReady = false

function pickVoice() {
  if (typeof speechSynthesis === 'undefined') return
  // `localService` voices are synthesized by the OS. The rest (for example
  // Chrome's "Google ..." voices) are network voices and are never used.
  const voices = speechSynthesis.getVoices().filter((v) => v.localService)
  preferredVoice =
    voices.find((v) => /en-GB/i.test(v.lang) && /(George|Daniel|Ryan|Oliver|Thomas)/i.test(v.name)) ||
    voices.find((v) => /en-US/i.test(v.lang) && /(Natural|Guy|Davis|David|Mark|Alex)/i.test(v.name)) ||
    voices.find((v) => /en-GB/i.test(v.lang)) ||
    voices.find((v) => /en-US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] ||
    null
  ttsReady = !!preferredVoice
}

export function initVoices() {
  if (typeof speechSynthesis === 'undefined') return
  pickVoice()
  speechSynthesis.onvoiceschanged = pickVoice
}

/**
 * Resolve whether spoken replies are available. Voices load asynchronously in
 * Chromium, so wait briefly for the list before answering.
 */
export async function probeTTS(): Promise<boolean> {
  if (typeof speechSynthesis === 'undefined') {
    ttsReady = false
    return false
  }
  initVoices()
  if (ttsReady) return true
  await new Promise<void>((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', done)
      resolve()
    }
    speechSynthesis.addEventListener('voiceschanged', done)
    setTimeout(done, 1500)
  })
  pickVoice()
  return ttsReady
}

export function ttsSupported(): boolean {
  return ttsReady
}

export function cancelSpeech() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

/**
 * Turn tutor text into clean spoken words: formulas become spoken English,
 * markdown and stray symbols are scrubbed.
 */
function sanitizeForSpeech(text: string): string {
  return speakableMathText(text)
}

/** speechSynthesis keeps its own FIFO queue, so sentences play in call order. */
function speakSentence(text: string, onEnd?: () => void) {
  const clean = sanitizeForSpeech(text)
  if (!clean || !preferredVoice || typeof speechSynthesis === 'undefined') {
    onEnd?.()
    return
  }
  const u = new SpeechSynthesisUtterance(clean)
  u.voice = preferredVoice
  u.lang = preferredVoice.lang
  u.rate = 1.02
  u.pitch = 1.0
  if (onEnd) {
    let fired = false
    const once = () => {
      if (fired) return
      fired = true
      onEnd()
    }
    u.onend = once
    u.onerror = once
  }
  speechSynthesis.speak(u)
}

/**
 * Speaks streamed text incrementally: feed it raw chunks and it flushes complete
 * sentences to the synth as they arrive, so speech tracks the stream in near
 * real time. Call `flush()` at the end to speak any trailing partial sentence.
 */
export class IncrementalSpeaker {
  private buffer = ''
  private onSpeakingChange?: (speaking: boolean) => void
  private pending = 0

  constructor(onSpeakingChange?: (speaking: boolean) => void) {
    this.onSpeakingChange = onSpeakingChange
  }

  private enqueue(sentence: string) {
    const s = sentence.trim()
    if (!s) return
    this.pending++
    this.onSpeakingChange?.(true)
    speakSentence(s, () => {
      this.pending = Math.max(0, this.pending - 1)
      if (this.pending === 0) this.onSpeakingChange?.(false)
    })
  }

  push(chunk: string) {
    this.buffer += chunk
    const re = /[^.!?…\n]*[.!?…\n]+/g
    let match: RegExpExecArray | null
    let lastIndex = 0
    while ((match = re.exec(this.buffer)) !== null) {
      this.enqueue(match[0])
      lastIndex = re.lastIndex
    }
    if (lastIndex > 0) this.buffer = this.buffer.slice(lastIndex)
  }

  /** Speak one already-complete sentence (bypasses the chunk buffer). */
  pushSentence(sentence: string) {
    this.enqueue(sentence)
  }

  flush() {
    if (this.buffer.trim()) this.enqueue(this.buffer)
    this.buffer = ''
  }

  cancel() {
    this.buffer = ''
    this.pending = 0
    cancelSpeech()
    this.onSpeakingChange?.(false)
  }
}
