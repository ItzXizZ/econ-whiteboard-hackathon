export interface StoredStroke {
  id: string
  color: string
  width: number
  points: { x: number; y: number }[]
}

export interface StoredImage {
  id: string
  src: string
  x: number
  y: number
  w: number
  h: number
}

export interface MathBoardSnapshot {
  v: 1
  strokes: StoredStroke[]
  images: StoredImage[]
  prompt?: string
  lessonContext?: string
  recognitionOverrides?: Record<string, string>
  savedAt: number
}

const STABLE_GUEST_ID_KEY = 'econ-coach-stable-guest-id'
const BOARD_KEY_PREFIX = 'econ-coach-board:'

/** When set (a signed-in Econ Coach account), board ink is scoped to it. */
let scopeOverride: string | null = null

/** Bind board localStorage to a specific account (the Econ Coach username). */
export function setMathBoardUserScope(scope: string | null): void {
  scopeOverride = scope?.trim() || null
}

/**
 * Scope for board keys. Signed-in users get their account scope; before
 * sign-in a STABLE per-browser id (localStorage) is used so nothing written
 * in that window is lost.
 */
function mathScope(): string {
  if (scopeOverride) return scopeOverride
  try {
    let id = localStorage.getItem(STABLE_GUEST_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(STABLE_GUEST_ID_KEY, id)
    }
    return `mathguest:${id}`
  } catch {
    return 'mathguest'
  }
}

function storageKey(adventureId: string): string {
  return `${BOARD_KEY_PREFIX}${mathScope()}:${adventureId}`
}

function isStroke(x: unknown): x is StoredStroke {
  if (!x || typeof x !== 'object') return false
  const s = x as StoredStroke
  return (
    typeof s.id === 'string' &&
    typeof s.color === 'string' &&
    typeof s.width === 'number' &&
    Array.isArray(s.points) &&
    s.points.every(
      (p) => p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)
    )
  )
}

function isImage(x: unknown): x is StoredImage {
  if (!x || typeof x !== 'object') return false
  const im = x as StoredImage
  return (
    typeof im.id === 'string' &&
    typeof im.src === 'string' &&
    typeof im.x === 'number' &&
    typeof im.y === 'number' &&
    typeof im.w === 'number' &&
    typeof im.h === 'number' &&
    im.w > 0 &&
    im.h > 0
  )
}

function validRecognitionOverrides(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const overrides: Record<string, string> = {}
  for (const [key, text] of Object.entries(value)) {
    if (key && key.length <= 20000 && typeof text === 'string' && text.length <= 120) {
      overrides[key] = text
    }
  }
  return Object.keys(overrides).length ? overrides : undefined
}

function parseSnapshot(raw: string | null): MathBoardSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const snap = parsed as Partial<MathBoardSnapshot>
    if (snap.v !== 1) return null
    const strokes = Array.isArray(snap.strokes) ? snap.strokes.filter(isStroke) : []
    const images = Array.isArray(snap.images) ? snap.images.filter(isImage) : []
    const prompt = typeof snap.prompt === 'string' ? snap.prompt : undefined
    const lessonContext =
      typeof snap.lessonContext === 'string' ? snap.lessonContext.slice(-4000) : undefined
    const recognitionOverrides = validRecognitionOverrides(snap.recognitionOverrides)
    if (
      strokes.length === 0 &&
      images.length === 0 &&
      !prompt &&
      !lessonContext &&
      !recognitionOverrides
    ) return null
    // Missing savedAt must be 0, not Date.now() — a fabricated "now" lets a
    // stale cloud snapshot beat real local ink on every refresh.
    const savedAt = typeof snap.savedAt === 'number' && Number.isFinite(snap.savedAt) ? snap.savedAt : 0
    return { v: 1, strokes, images, prompt, lessonContext, recognitionOverrides, savedAt }
  } catch {
    return null
  }
}

/**
 * Rescue boards stranded under unreachable keys. Guest workspaces are per-tab
 * session, so a new session (or a server restart) spawns fresh guest and
 * adventure ids and used to orphan the whiteboard — the ink was still in
 * localStorage but under a key nothing would ever read again. When the current
 * adventure has no board, adopt the NEWEST orphan (dead guest scope, or same
 * scope but an adventure id that no longer exists) and re-key survivors so
 * nothing with real ink is ever destroyed.
 */
function adoptOrphanBoard(currentKey: string, liveAdventureIds: Set<string>): MathBoardSnapshot | null {
  try {
    const scope = mathScope()
    const candidates: { key: string; snap: MathBoardSnapshot }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(BOARD_KEY_PREFIX) || k === currentKey) continue
      const keyScope = k.split(':').slice(1, -1).join(':')
      const advId = k.split(':').pop() ?? ''
      let orphaned: boolean
      if (keyScope === scope) {
        // Same scope: only orphaned if its adventure no longer exists.
        orphaned = !liveAdventureIds.has(advId)
      } else {
        // Dead guest/local scopes only; other signed-in users' keys stay.
        orphaned =
          keyScope === '' ||
          keyScope === 'local' ||
          keyScope.startsWith('guest:') ||
          keyScope.startsWith('mathguest')
      }
      if (!orphaned) continue
      const snap = parseSnapshot(localStorage.getItem(k))
      if (snap && (snap.strokes.length || snap.images.length)) candidates.push({ key: k, snap })
      else if (!snap) localStorage.removeItem(k) // empty/corrupt orphan — clean up
    }
    if (!candidates.length) return null
    candidates.sort((a, b) => b.snap.savedAt - a.snap.savedAt)
    const chosen = candidates[0]
    localStorage.setItem(currentKey, JSON.stringify(chosen.snap))
    localStorage.removeItem(chosen.key)
    // Survivors are re-keyed into the live scope under their adventure ids —
    // still reachable by a future rescue, never silently deleted.
    for (const c of candidates.slice(1)) {
      const advId = c.key.split(':').pop()
      if (advId) {
        const rescueKey = `${BOARD_KEY_PREFIX}${scope}:${advId}`
        if (!localStorage.getItem(rescueKey)) localStorage.setItem(rescueKey, JSON.stringify(c.snap))
      }
      if (c.key !== `${BOARD_KEY_PREFIX}${scope}:${advId}`) localStorage.removeItem(c.key)
    }
    return chosen.snap
  } catch {
    return null
  }
}

// ── Cloud-sync hooks (used by the app shell to auto-save boards to the local server) ──

type SavedListener = (adventureId: string, snapshot: MathBoardSnapshot) => void
const savedListeners = new Set<SavedListener>()

/** Subscribe to every successful local board save. Returns an unsubscribe fn. */
export function onMathBoardSaved(cb: SavedListener): () => void {
  savedListeners.add(cb)
  return () => savedListeners.delete(cb)
}

function emitSaved(adventureId: string, snapshot: MathBoardSnapshot) {
  for (const cb of savedListeners) {
    try {
      cb(adventureId, snapshot)
    } catch {
      /* listener errors must never break local persistence */
    }
  }
}

export type SeedMathBoardResult = 'kept-local' | 'wrote-cloud' | 'skipped'

/**
 * Write a server-fetched snapshot into local storage so MathLayer's normal
 * restore path picks it up. Keeps the LOCAL copy when it is newer (offline
 * edits win over a stale cloud copy). Does not notify save listeners.
 */
export function seedMathBoard(adventureId: string, snapshot: unknown): SeedMathBoardResult {
  if (!adventureId) return 'skipped'
  try {
    const incoming = parseSnapshot(typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot))
    if (!incoming) {
      dbg({ ev: 'seed-unparseable', adventureId })
      return 'skipped'
    }
    const key = storageKey(adventureId)
    const local = parseSnapshot(localStorage.getItem(key))
    // Ink beats timestamps: page-unload flushes write ink-less snapshots with
    // fresh savedAt values, which must never shadow a cloud copy of real work.
    // Equal timestamps: keep whichever has more ink (refresh race safety).
    const incomingInk = incoming.strokes.length + incoming.images.length
    const localInk = local ? local.strokes.length + local.images.length : 0
    const incomingHasInk = incomingInk > 0
    const localHasInk = localInk > 0
    const keepLocal = localHasInk
      ? !incomingHasInk ||
        local!.savedAt > incoming.savedAt ||
        (local!.savedAt === incoming.savedAt && localInk >= incomingInk)
      : !!local && !incomingHasInk && local.savedAt >= incoming.savedAt
    if (keepLocal) {
      dbg({ ev: 'seed-skip-local', key, localSavedAt: local?.savedAt, incomingSavedAt: incoming.savedAt })
      return 'kept-local'
    }
    dbg({ ev: 'seed-write', key, strokes: incoming.strokes.length })
    localStorage.setItem(key, JSON.stringify(incoming))
    return 'wrote-cloud'
  } catch {
    return 'skipped'
  }
}

function dbg(entry: Record<string, unknown>) {
  const w = window as unknown as { __mbLog?: unknown[] }
  ;(w.__mbLog ??= []).push({ t: Date.now(), ...entry })
}

export function loadMathBoard(
  adventureId: string,
  liveAdventureIds?: string[],
  opts?: { adoptOrphans?: boolean }
): MathBoardSnapshot | null {
  if (!adventureId) return null
  try {
    const key = storageKey(adventureId)
    const direct = parseSnapshot(localStorage.getItem(key))
    dbg({ ev: 'load', key, found: !!direct, strokes: direct?.strokes.length ?? null })
    if (direct) return direct
    // Orphan rescue exists for the guest /math flow where adventure/guest ids
    // churn. Explicitly-created boards must NOT adopt stray ink.
    if (opts?.adoptOrphans === false) return null
    return adoptOrphanBoard(key, new Set([adventureId, ...(liveAdventureIds ?? [])]))
  } catch {
    return null
  }
}

export function saveMathBoard(
  adventureId: string,
  data: {
    strokes: StoredStroke[]
    images: StoredImage[]
    prompt?: string
    lessonContext?: string
    recognitionOverrides?: Record<string, string>
  }
): boolean {
  if (!adventureId) return false
  const snap: MathBoardSnapshot = {
    v: 1,
    strokes: data.strokes,
    images: data.images,
    prompt: data.prompt?.trim() || undefined,
    lessonContext: data.lessonContext?.trim().slice(-4000) || undefined,
    recognitionOverrides: validRecognitionOverrides(data.recognitionOverrides),
    savedAt: Date.now(),
  }
  const key = storageKey(adventureId)
  const payload = JSON.stringify(snap)
  dbg({ ev: 'save', key, strokes: snap.strokes.length, images: snap.images.length, stack: new Error().stack })
  try {
    localStorage.setItem(key, payload)
    emitSaved(adventureId, snap)
    return true
  } catch {
    // Quota exceeded — keep ink even if images are too large.
    try {
      const slim = { ...snap, images: [], savedAt: Date.now() } satisfies MathBoardSnapshot
      localStorage.setItem(key, JSON.stringify(slim))
      // Still sync the FULL snapshot to the server — the quota limit is local-only.
      emitSaved(adventureId, snap)
      return true
    } catch {
      return false
    }
  }
}

export function clearMathBoard(adventureId: string) {
  if (!adventureId) return
  try {
    localStorage.removeItem(storageKey(adventureId))
  } catch {
    /* ignore */
  }
}
