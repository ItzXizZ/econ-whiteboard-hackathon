/**
 * Econ Coach accounts + whiteboards, stored entirely on this machine.
 *
 * Same API shape as the original cloud-backed service (username/password
 * accounts, opaque bearer sessions, auto-saved board snapshots), but the data
 * lives in plain JSON files under server/data/ instead of a hosted database:
 *
 *   server/data/accounts.json        users, sessions, board index
 *   server/data/boards/<hash>.json   one snapshot (ink + pasted images) per board
 *
 * Passwords are scrypt-hashed with a per-user salt; sessions last 90 days.
 */

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const SCRYPT_KEYLEN = 64
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90 // 90 days
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const MAX_BOARD_BYTES = 8 * 1024 * 1024 // pasted problems are data URLs; cap at 8MB

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.ECON_DATA_DIR || path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'accounts.json')
const BOARDS_DIR = path.join(DATA_DIR, 'boards')

// ── Tiny JSON store ───────────────────────────────────────────────────

/** @type {{users: Record<string, any>, sessions: Record<string, any>, boards: Record<string, any>} | null} */
let db = null
let loadPromise = null
let writeChain = Promise.resolve()

async function loadDb() {
  if (db) return db
  if (!loadPromise) {
    loadPromise = (async () => {
      await fs.mkdir(BOARDS_DIR, { recursive: true })
      let parsed = null
      try {
        parsed = JSON.parse(await fs.readFile(DB_FILE, 'utf8'))
      } catch (err) {
        if (err.code !== 'ENOENT') {
          // Never silently start empty over a corrupt file: keep it for recovery.
          const backup = `${DB_FILE}.corrupt-${Date.now()}`
          await fs.rename(DB_FILE, backup).catch(() => {})
          console.warn(`  accounts: could not read ${DB_FILE} (${err.message}); moved to ${backup}`)
        }
      }
      // Null-prototype maps: usernames like "__proto__" or "constructor" are
      // valid under USERNAME_RE and must behave like any other key.
      const table = (src) =>
        Object.assign(Object.create(null), src && typeof src === 'object' ? src : {})
      db = {
        users: table(parsed?.users),
        sessions: table(parsed?.sessions),
        boards: table(parsed?.boards),
      }
      return db
    })()
  }
  return loadPromise
}

async function writeFileAtomic(file, contents) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  await fs.writeFile(tmp, contents)
  try {
    await fs.rename(tmp, file)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

/** Persist the index. Writes are serialized so concurrent requests can't interleave. */
function saveDb() {
  const snapshot = JSON.stringify(db)
  writeChain = writeChain.catch(() => {}).then(() => writeFileAtomic(DB_FILE, snapshot))
  return writeChain
}

function boardFile(usernameLower, id) {
  const hash = crypto.createHash('sha1').update(`${usernameLower}\n${id}`).digest('hex')
  return path.join(BOARDS_DIR, `${hash}.json`)
}

function boardKey(usernameLower, id) {
  return `${usernameLower}\n${id}`
}

const boardWriteChains = new Map()

/** Serialize reads/writes per board so an older autosave can't land after a newer one. */
function withBoardLock(key, fn) {
  const prev = boardWriteChains.get(key) || Promise.resolve()
  const next = prev.catch(() => {}).then(fn)
  boardWriteChains.set(key, next)
  void next.finally(() => {
    if (boardWriteChains.get(key) === next) boardWriteChains.delete(key)
  }).catch(() => {})
  return next
}

async function readBoardData(usernameLower, id) {
  try {
    return JSON.parse(await fs.readFile(boardFile(usernameLower, id), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

// ── Password hashing ──────────────────────────────────────────────────

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

async function hashPassword(password, salt) {
  return (await scrypt(password, salt)).toString('hex')
}

async function verifyPassword(password, salt, expectedHex) {
  const actual = await scrypt(password, salt)
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

// ── Sessions ──────────────────────────────────────────────────────────

async function createSession(usernameLower) {
  const store = await loadDb()
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  // Opportunistic prune of expired sessions.
  for (const [t, s] of Object.entries(store.sessions)) {
    if (now - s.createdAt > SESSION_TTL_MS) delete store.sessions[t]
  }
  store.sessions[token] = { usernameLower, createdAt: now }
  await saveDb()
  return token
}

/** Resolve the bearer token on a request to { token, usernameLower, username } or null. */
async function sessionFromReq(req) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1]
  const store = await loadDb()
  if (!Object.hasOwn(store.sessions, token)) return null
  const s = store.sessions[token]
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    delete store.sessions[token]
    void saveDb().catch(() => {})
    return null
  }
  const user = Object.hasOwn(store.users, s.usernameLower) ? store.users[s.usernameLower] : null
  if (!user) return null
  return { token, usernameLower: s.usernameLower, username: user.username }
}

// ── Routes ────────────────────────────────────────────────────────────

export function registerAccountRoutes(app, base = '/api/econ') {
  const guard = (handler) => async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      console.warn('  accounts route error:', err.message)
      if (!res.headersSent) res.status(500).json({ error: 'Server error, please try again.' })
    }
  }

  app.post(
    `${base}/register`,
    guard(async (req, res) => {
      const username = String(req.body?.username ?? '').trim()
      const password = String(req.body?.password ?? '')

      if (!USERNAME_RE.test(username)) {
        return res
          .status(400)
          .json({ error: 'Username must be 3-20 characters: letters, numbers, underscores.' })
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' })
      }

      const store = await loadDb()
      const key = username.toLowerCase()
      if (Object.hasOwn(store.users, key)) {
        return res.status(409).json({ error: 'That username is taken. Try another or log in.' })
      }
      const salt = crypto.randomBytes(16).toString('hex')
      const hash = await hashPassword(password, salt)
      // Re-check after the async hash: two concurrent registrations must not both win.
      if (Object.hasOwn(store.users, key)) {
        return res.status(409).json({ error: 'That username is taken. Try another or log in.' })
      }
      store.users[key] = { username, salt, hash, createdAt: Date.now() }
      const token = await createSession(key)
      res.json({ token, username })
    })
  )

  app.post(
    `${base}/login`,
    guard(async (req, res) => {
      const username = String(req.body?.username ?? '').trim()
      const password = String(req.body?.password ?? '')
      const store = await loadDb()
      const key = username.toLowerCase()
      const user = Object.hasOwn(store.users, key) ? store.users[key] : null

      if (!user || !(await verifyPassword(password, user.salt, user.hash))) {
        return res.status(401).json({ error: 'Wrong username or password.' })
      }
      const token = await createSession(key)
      res.json({ token, username: user.username })
    })
  )

  app.get(
    `${base}/me`,
    guard(async (req, res) => {
      const session = await sessionFromReq(req)
      if (!session) return res.status(401).json({ error: 'Not signed in' })
      res.json({ username: session.username })
    })
  )

  app.post(
    `${base}/logout`,
    guard(async (req, res) => {
      const session = await sessionFromReq(req)
      if (session) {
        const store = await loadDb()
        delete store.sessions[session.token]
        await saveDb()
      }
      res.json({ ok: true })
    })
  )

  // ── Whiteboards (auto-saved) ──

  app.get(
    `${base}/boards`,
    guard(async (req, res) => {
      const session = await sessionFromReq(req)
      if (!session) return res.status(401).json({ error: 'Not signed in' })
      const store = await loadDb()
      const boards = Object.values(store.boards)
        .filter((b) => b.usernameLower === session.usernameLower)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt }))
      res.json({ boards })
    })
  )

  app.post(
    `${base}/boards`,
    guard(async (req, res) => {
      const session = await sessionFromReq(req)
      if (!session) return res.status(401).json({ error: 'Not signed in' })

      const id = String(req.body?.id ?? '').slice(0, 120)
      const name = String(req.body?.name ?? '').trim().slice(0, 80) || 'Untitled'
      if (!id) return res.status(400).json({ error: 'Missing board id' })

      const store = await loadDb()
      const key = boardKey(session.usernameLower, id)
      const existing = Object.hasOwn(store.boards, key) ? store.boards[key] : null
      // A bare create must never wipe an existing board's saved snapshot.
      const createdAt = existing?.createdAt ?? Date.now()
      store.boards[key] = {
        id,
        usernameLower: session.usernameLower,
        name,
        createdAt,
        updatedAt: Date.now(),
      }
      await saveDb()
      res.json({ board: { id, name, createdAt } })
    })
  )

  app.get(
    `${base}/boards/:id`,
    guard(async (req, res) => {
      const session = await sessionFromReq(req)
      if (!session) return res.status(401).json({ error: 'Not signed in' })
      const id = req.params.id
      const store = await loadDb()
      const key = boardKey(session.usernameLower, id)
      if (!Object.hasOwn(store.boards, key)) return res.status(404).json({ error: 'Board not found' })
      const meta = store.boards[key]
      const data = await withBoardLock(key, () => readBoardData(session.usernameLower, id))
      res.json({ board: { id: meta.id, name: meta.name, data: data ?? null } })
    })
  )

  app.put(
    `${base}/boards/:id`,
    guard(async (req, res) => {
      const session = await sessionFromReq(req)
      if (!session) return res.status(401).json({ error: 'Not signed in' })
      const id = String(req.params.id).slice(0, 120)
      const name =
        req.body?.name != null ? String(req.body.name).trim().slice(0, 80) : undefined
      const boardData = req.body?.data !== undefined ? req.body.data : undefined

      let serialized
      if (boardData !== undefined) {
        serialized = JSON.stringify(boardData)
        if (serialized.length > MAX_BOARD_BYTES) {
          return res.status(413).json({ error: 'Board too large to save' })
        }
      }

      const incomingSavedAt =
        boardData && typeof boardData === 'object' && typeof boardData.savedAt === 'number'
          ? boardData.savedAt
          : null

      const store = await loadDb()
      const key = boardKey(session.usernameLower, id)

      const result = await withBoardLock(key, async () => {
        // Reject out-of-order autosaves so an older in-flight PUT can't clobber
        // a newer snapshot after refresh.
        if (boardData !== undefined && incomingSavedAt != null) {
          const prev = await readBoardData(session.usernameLower, id)
          const prevSaved = prev?.savedAt
          if (typeof prevSaved === 'number' && incomingSavedAt < prevSaved) {
            return { ok: true, skipped: 'stale' }
          }
        }
        // Race: an autosave PUT can land before the create POST. Upsert so ink
        // is never silently dropped when the board row is missing.
        const existing = Object.hasOwn(store.boards, key) ? store.boards[key] : null
        store.boards[key] = {
          id,
          usernameLower: session.usernameLower,
          name: name !== undefined ? name || 'Untitled' : existing?.name ?? 'Untitled',
          createdAt: existing?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        }
        if (serialized !== undefined) {
          await writeFileAtomic(boardFile(session.usernameLower, id), serialized)
        }
        await saveDb()
        return { ok: true }
      })
      res.json(result)
    })
  )

  app.delete(
    `${base}/boards/:id`,
    guard(async (req, res) => {
      const session = await sessionFromReq(req)
      if (!session) return res.status(401).json({ error: 'Not signed in' })
      const id = req.params.id
      const store = await loadDb()
      const key = boardKey(session.usernameLower, id)
      await withBoardLock(key, async () => {
        delete store.boards[key]
        await fs.rm(boardFile(session.usernameLower, id), { force: true })
        await saveDb()
      })
      res.json({ ok: true })
    })
  )
}
