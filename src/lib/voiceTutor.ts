/**
 * Voice tutor plumbing. Nothing here leaves the machine.
 *
 *   - Speech IN (the mic) uses Argmax WhisperKit running on this computer.
 *     The browser records the question, turns it into a 16 kHz WAV and posts
 *     it to the local API server, which hands it to the local Argmax server
 *     (see server/voice.js). If that server is not running the mic is hidden
 *     and questions are typed.
 *   - Speech OUT uses the browser's built-in speechSynthesis, restricted to
 *     voices the OS reports as on-device (`localService`). Sentences are
 *     spoken incrementally as the tutor's reply streams in.
 *   - The Web Speech API recognizer stays available only as an explicit
 *     opt-in (VITE_ALLOW_BROWSER_STT=1) because Chrome and Edge implement it
 *     by sending audio to a cloud service.
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
  /**
   * True when stop() is followed by a wait (the recording is transcribed
   * after it ends) before the final text and onEnd arrive.
   */
  slowStop?: boolean
}

interface STTCallbacks {
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (err: string) => void
  onEnd?: () => void
  onStart?: () => void
}

const BROWSER_STT_ALLOWED = import.meta.env.VITE_ALLOW_BROWSER_STT === '1'

function browserRecognitionSupported(): boolean {
  if (!BROWSER_STT_ALLOWED) return false
  return (
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  )
}

/** Web Speech API recognizer (opt-in only). */
function createBrowserRecognizer(cb: STTCallbacks): RecognizerHandle | null {
  if (!browserRecognitionSupported()) return null
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

// ── Speech-to-text through the local Argmax server ──────────────────────────

let argmaxReady = false

/** Ask the API server whether the local Argmax speech server is running. */
export async function probeSTT(): Promise<boolean> {
  try {
    const res = await fetch('/api/econ/voice/status', { signal: AbortSignal.timeout(4000) })
    const body = res.ok ? await res.json() : null
    argmaxReady = body?.stt === 'argmax'
  } catch {
    argmaxReady = false
  }
  return speechRecognitionSupported()
}

function canRecord(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

export function speechRecognitionSupported(): boolean {
  return (argmaxReady && canRecord()) || browserRecognitionSupported()
}

/** Which engine the mic uses right now. */
export function speechRecognitionEngine(): 'argmax' | 'browser' | 'none' {
  if (argmaxReady && canRecord()) return 'argmax'
  return browserRecognitionSupported() ? 'browser' : 'none'
}

const WAV_RATE = 16000
/** One recording is cut off here so a forgotten mic cannot run forever. */
const MAX_RECORDING_MS = 45000

/** Decode whatever the browser recorded and re-encode it as 16 kHz mono 16-bit WAV. */
async function toWav16k(blob: Blob): Promise<Blob | null> {
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
  const ctx = new AC()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close()
  }
  if (decoded.duration < 0.3) return null
  const frames = Math.ceil(decoded.duration * WAV_RATE)
  const offline = new OfflineAudioContext(1, frames, WAV_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const pcm = (await offline.startRendering()).getChannelData(0)

  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2))
  const ascii = (off: number, text: string) => {
    for (let i = 0; i < text.length; i++) out.setUint8(off + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  out.setUint32(4, 36 + pcm.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true) // PCM
  out.setUint16(22, 1, true) // mono
  out.setUint32(24, WAV_RATE, true)
  out.setUint32(28, WAV_RATE * 2, true)
  out.setUint16(32, 2, true)
  out.setUint16(34, 16, true)
  ascii(36, 'data')
  out.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]))
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true)
  }
  return new Blob([out.buffer], { type: 'audio/wav' })
}

/**
 * Record from the mic and transcribe with Argmax when recording stops.
 * Same shape as the Web Speech recognizer: onStart, then onFinal with the
 * text, then onEnd. There is no interim text; the words arrive after stop().
 */
function createArgmaxRecognizer(cb: STTCallbacks): RecognizerHandle {
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let cancelled = false
  let limit: ReturnType<typeof setTimeout> | null = null

  const release = () => {
    if (limit) clearTimeout(limit)
    limit = null
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    recorder = null
  }

  const finish = async () => {
    const recorded = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })
    chunks = []
    release()
    if (cancelled) return
    try {
      const wav = recorded.size > 0 ? await toWav16k(recorded) : null
      if (wav) {
        const res = await fetch('/api/econ/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: wav,
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || 'Could not transcribe that.')
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (cancelled) return
        if (text) cb.onFinal?.(text)
        else cb.onError?.("I didn't catch that. Try again a little closer to the mic.")
      }
    } catch (err) {
      if (!cancelled) cb.onError?.(err instanceof Error ? err.message : 'Could not transcribe that.')
    }
    if (!cancelled) cb.onEnd?.()
  }

  return {
    slowStop: true,
    start: () => {
      if (recorder || stream) return
      cancelled = false
      chunks = []
      cancelSpeech() // do not record the tutor's own voice
      navigator.mediaDevices
        .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop())
            return
          }
          stream = s
          recorder = new MediaRecorder(s)
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }
          recorder.onstop = () => void finish()
          recorder.start()
          limit = setTimeout(() => recorder?.state === 'recording' && recorder.stop(), MAX_RECORDING_MS)
          cb.onStart?.()
        })
        .catch((err) => {
          release()
          const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
          cb.onError?.(denied ? 'not-allowed' : 'No microphone was found.')
          if (!denied) cb.onEnd?.()
        })
    },
    stop: () => {
      if (recorder?.state === 'recording') recorder.stop()
      else if (!recorder) {
        // stop() before the mic opened: nothing was recorded.
        cancelled = true
        release()
        cb.onEnd?.()
      }
    },
    abort: () => {
      cancelled = true
      try {
        if (recorder?.state === 'recording') recorder.stop()
      } catch {
        /* ignore */
      }
      release()
    },
  }
}

/** Create a recognizer. Returns null when voice input is off or unsupported. */
export function createRecognizer(cb: STTCallbacks): RecognizerHandle | null {
  if (argmaxReady && canRecord()) return createArgmaxRecognizer(cb)
  return createBrowserRecognizer(cb)
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

export interface WordSpeechHandle {
  cancel: () => void
}

export function speakWithWordHighlights(
  text: string,
  onWord: (index: number) => void,
  onSpeaking: (speaking: boolean) => void
): WordSpeechHandle {
  const clean = sanitizeForSpeech(text)
  if (!clean || !preferredVoice || typeof speechSynthesis === 'undefined') {
    onWord(-1)
    onSpeaking(false)
    return { cancel: () => {} }
  }
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.voice = preferredVoice
  utterance.lang = preferredVoice.lang
  utterance.rate = 1.02
  utterance.pitch = 1
  const words = clean.match(/\S+/g) ?? []
  let cancelled = false
  let boundarySeen = false
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let wordTimer: ReturnType<typeof setTimeout> | null = null
  const clearTimers = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer)
    if (wordTimer) clearTimeout(wordTimer)
    fallbackTimer = null
    wordTimer = null
  }
  utterance.onstart = () => onSpeaking(true)
  utterance.onboundary = (event) => {
    if (event.name && event.name !== 'word') return
    boundarySeen = true
    clearTimers()
    const prefix = clean.slice(0, Math.max(0, event.charIndex)).trim()
    const index = prefix ? prefix.split(/\s+/).length : 0
    onWord(Math.min(words.length - 1, index))
  }
  const finish = () => {
    clearTimers()
    if (cancelled) return
    onWord(-1)
    onSpeaking(false)
  }
  utterance.onend = finish
  utterance.onerror = finish
  fallbackTimer = setTimeout(() => {
    fallbackTimer = null
    if (cancelled || boundarySeen || words.length === 0) return
    let index = 0
    const advance = () => {
      if (cancelled || boundarySeen || index >= words.length) return
      onWord(index)
      const duration = Math.max(130, (words[index].length * 62 + 65) / utterance.rate)
      index++
      wordTimer = setTimeout(advance, duration)
    }
    advance()
  }, 600)
  speechSynthesis.speak(utterance)
  return {
    cancel: () => {
      if (cancelled) return
      cancelled = true
      clearTimers()
      speechSynthesis.cancel()
      onWord(-1)
      onSpeaking(false)
    },
  }
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
