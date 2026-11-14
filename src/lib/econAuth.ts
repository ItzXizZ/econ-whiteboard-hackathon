/**
 * Client side of the Econ Coach username/password account system.
 * Accounts live in a JSON file on the local API server; the session token is
 * kept in localStorage and sent as a Bearer header.
 */

const TOKEN_KEY = 'econ-auth-token'
const USERNAME_KEY = 'econ-auth-username'

export interface EconSession {
  token: string
  username: string
}

export function getStoredSession(): EconSession | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const username = localStorage.getItem(USERNAME_KEY)
    if (token && username) return { token, username }
  } catch {
    /* storage unavailable */
  }
  return null
}

function storeSession(session: EconSession) {
  try {
    localStorage.setItem(TOKEN_KEY, session.token)
    localStorage.setItem(USERNAME_KEY, session.username)
  } catch {
    /* storage unavailable */
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
  } catch {
    /* storage unavailable */
  }
}

async function authRequest(
  path: '/api/econ/login' | '/api/econ/register',
  username: string,
  password: string
): Promise<EconSession> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new Error('Could not reach the server. Is it running?')
  }
  const body = (await res.json().catch(() => ({}))) as {
    token?: string
    username?: string
    error?: string
  }
  if (!res.ok || !body.token || !body.username) {
    throw new Error(body.error || 'Request failed. Please try again.')
  }
  const session = { token: body.token, username: body.username }
  storeSession(session)
  return session
}

export function login(username: string, password: string): Promise<EconSession> {
  return authRequest('/api/econ/login', username, password)
}

export function register(username: string, password: string): Promise<EconSession> {
  return authRequest('/api/econ/register', username, password)
}

/** Confirm a stored token is still valid on the server. */
export async function validateSession(session: EconSession): Promise<boolean> {
  try {
    const res = await fetch('/api/econ/me', {
      headers: { Authorization: `Bearer ${session.token}` },
    })
    if (res.status === 401) return false
    return res.ok
  } catch {
    // Server unreachable: trust the stored session rather than logging out.
    return true
  }
}

export async function logout(session: EconSession | null): Promise<void> {
  clearStoredSession()
  if (!session) return
  try {
    await fetch('/api/econ/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
    })
  } catch {
    /* best-effort */
  }
}
