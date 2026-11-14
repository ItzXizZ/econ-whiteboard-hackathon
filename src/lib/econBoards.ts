/**
 * Multiple-whiteboard management for Econ Coach.
 *
 * Boards are saved by the local API server (a JSON file on this machine),
 * with localStorage as a cache: the list and each board's ink/images are
 * mirrored in the browser, writes go to both, and reads prefer the server.
 */

import { clearMathBoard, loadMathBoard, type MathBoardSnapshot } from './mathBoardStorage'
import type { EconSession } from './econAuth'

export interface EconBoard {
  id: string
  name: string
  createdAt: number
}

/* ── Local cache (also the offline fallback) ── */

function listKey(username: string): string {
  return `econ-boards:${username.toLowerCase()}`
}

function activeBoardKey(username: string): string {
  return `econ-active-board:${username.toLowerCase()}`
}

export function readActiveBoardId(username: string): string | null {
  try {
    const id = localStorage.getItem(activeBoardKey(username))
    return id && id.trim() ? id : null
  } catch {
    return null
  }
}

export function writeActiveBoardId(username: string, id: string): void {
  try {
    localStorage.setItem(activeBoardKey(username), id)
  } catch {
    /* storage unavailable */
  }
}

function readList(username: string): EconBoard[] {
  try {
    const raw = localStorage.getItem(listKey(username))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (b): b is EconBoard =>
        !!b &&
        typeof (b as EconBoard).id === 'string' &&
        typeof (b as EconBoard).name === 'string' &&
        typeof (b as EconBoard).createdAt === 'number'
    )
  } catch {
    return []
  }
}

function writeList(username: string, boards: EconBoard[]) {
  try {
    localStorage.setItem(listKey(username), JSON.stringify(boards))
  } catch {
    /* storage unavailable */
  }
}

function newBoard(username: string, index: number): EconBoard {
  return {
    // Username in the id keeps each account's board content keys separate.
    id: `econ-${username.toLowerCase()}-${crypto.randomUUID()}`,
    name: `Problem ${index}`,
    createdAt: Date.now(),
  }
}

/* ── Server API ── */

function authHeaders(session: EconSession): Record<string, string> {
  return { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }
}

async function apiListBoards(session: EconSession): Promise<EconBoard[]> {
  const res = await fetch('/api/econ/boards', { headers: authHeaders(session) })
  if (!res.ok) throw new Error(`list failed (${res.status})`)
  const body = (await res.json()) as { boards?: EconBoard[] }
  return Array.isArray(body.boards) ? body.boards : []
}

async function apiCreateBoard(session: EconSession, board: EconBoard): Promise<void> {
  await fetch('/api/econ/boards', {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({ id: board.id, name: board.name }),
  })
}

/** Chrome caps fetch(keepalive) bodies at 64KB — boards with pasted images
 *  are far larger, so keepalive would make every autosave fail silently. */
const KEEPALIVE_MAX_BYTES = 60 * 1024

async function apiPatchBoard(
  session: EconSession,
  id: string,
  patch: { name?: string; data?: MathBoardSnapshot },
  opts?: { keepalive?: boolean }
): Promise<boolean> {
  const body = JSON.stringify(patch)
  // Only use keepalive when the payload fits the browser cap (e.g. rename /
  // unload of a small ink-only board). Normal autosaves never pass it.
  const useKeepalive = !!opts?.keepalive && body.length <= KEEPALIVE_MAX_BYTES
  try {
    const res = await fetch(`/api/econ/boards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: authHeaders(session),
      body,
      ...(useKeepalive ? { keepalive: true } : {}),
    })
    if (!res.ok) {
      console.warn(`[econ] board save failed (${res.status})`, id)
    }
    return res.ok
  } catch (err) {
    console.warn('[econ] board save network error', id, err)
    return false
  }
}

async function apiDeleteBoard(session: EconSession, id: string): Promise<void> {
  await fetch(`/api/econ/boards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  })
}

/** Fetch a board's saved snapshot from the server (null when none / offline). */
export async function fetchBoardData(
  session: EconSession,
  id: string
): Promise<MathBoardSnapshot | null> {
  try {
    const res = await fetch(`/api/econ/boards/${encodeURIComponent(id)}`, {
      headers: authHeaders(session),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { board?: { data?: MathBoardSnapshot | null } }
    return body.board?.data ?? null
  } catch {
    return null
  }
}

/* ── Auto-save queue (coalesces bursts; latest snapshot always wins) ── */

const inFlight = new Set<string>()
const pending = new Map<string, MathBoardSnapshot>()

export type BoardSyncStatus = 'saving' | 'saved' | 'error'

type SyncListener = (status: BoardSyncStatus) => void
const syncListeners = new Set<SyncListener>()

/** Subscribe to save status for the indicator in the top bar. */
export function onBoardSyncStatus(cb: SyncListener): () => void {
  syncListeners.add(cb)
  return () => syncListeners.delete(cb)
}

function emitSync(status: BoardSyncStatus) {
  for (const cb of syncListeners) {
    try {
      cb(status)
    } catch {
      /* UI listeners must never break persistence */
    }
  }
}

function syncIdle(): boolean {
  return inFlight.size === 0 && pending.size === 0
}

export function pushBoardData(session: EconSession, id: string, snapshot: MathBoardSnapshot): void {
  pending.set(id, snapshot)
  emitSync('saving')
  if (inFlight.has(id)) return
  const drain = async () => {
    inFlight.add(id)
    let ok = true
    try {
      while (pending.has(id)) {
        const snap = pending.get(id)!
        pending.delete(id)
        const wrote = await apiPatchBoard(session, id, { data: snap }).catch(() => false)
        if (!wrote) ok = false
      }
    } finally {
      inFlight.delete(id)
      if (syncIdle()) emitSync(ok ? 'saved' : 'error')
      else emitSync('saving')
    }
  }
  void drain()
}

/* ── Board list operations (server-first, local cache always updated) ── */

/**
 * Load the user's boards: server copy wins; boards that exist only locally
 * (created while the server was down) are uploaded, ink included.
 */
export async function loadBoardsRemote(session: EconSession): Promise<EconBoard[]> {
  const local = readList(session.username)
  let server: EconBoard[] | null = null
  try {
    server = await apiListBoards(session)
  } catch {
    server = null // offline / server down — run on the local cache
  }

  if (server === null) {
    if (local.length > 0) return local
    const first = [newBoard(session.username, 1)]
    writeList(session.username, first)
    return first
  }

  const serverIds = new Set(server.map((b) => b.id))
  const localOnly = local.filter((b) => !serverIds.has(b.id))
  for (const b of localOnly) {
    await apiCreateBoard(session, b).catch(() => {})
    const snap = loadMathBoard(b.id, [], { adoptOrphans: false })
    if (snap) pushBoardData(session, b.id, snap)
  }

  let merged = [...server, ...localOnly].sort((a, b) => a.createdAt - b.createdAt)
  if (merged.length === 0) {
    const first = newBoard(session.username, 1)
    await apiCreateBoard(session, first).catch(() => {})
    merged = [first]
  }
  writeList(session.username, merged)
  return merged
}

export function createBoard(session: EconSession, existing: EconBoard[]): EconBoard[] {
  const board = newBoard(session.username, existing.length + 1)
  const next = [...existing, board]
  writeList(session.username, next)
  void apiCreateBoard(session, board).catch(() => {})
  return next
}

export function renameBoard(
  session: EconSession,
  boards: EconBoard[],
  id: string,
  name: string
): EconBoard[] {
  const clean = name.trim()
  const next = boards.map((b) => (b.id === id ? { ...b, name: clean || b.name } : b))
  writeList(session.username, next)
  if (clean) void apiPatchBoard(session, id, { name: clean }).catch(() => false)
  return next
}

export function deleteBoard(session: EconSession, boards: EconBoard[], id: string): EconBoard[] {
  const next = boards.filter((b) => b.id !== id)
  writeList(session.username, next)
  clearMathBoard(id) // also drop the ink/images cached under this board
  void apiDeleteBoard(session, id).catch(() => {})
  return next
}
