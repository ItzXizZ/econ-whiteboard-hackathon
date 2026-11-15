import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactFlow, { Background, BackgroundVariant, Controls, ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Home,
  CloudOff,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  getStoredSession,
  login,
  logout,
  register,
  validateSession,
  type EconSession,
} from '../lib/econAuth'
import {
  createBoard,
  deleteBoard,
  fetchBoardData,
  loadBoardsRemote,
  onBoardSyncStatus,
  pushBoardData,
  readActiveBoardId,
  renameBoard,
  writeActiveBoardId,
  type EconBoard,
  type BoardSyncStatus,
} from '../lib/econBoards'
import {
  loadMathBoard,
  onMathBoardSaved,
  seedMathBoard,
  setMathBoardUserScope,
} from '../lib/mathBoardStorage'
import MathLayer from '../components/ExplorationMode/MathLayer'
import { useStore } from '../store/useStore'
import WelcomeScreen from './WelcomeScreen'
import LandingPage from './LandingPage'

const LANDING_SEEN_KEY = 'econ-landing-seen'

/* ────────────────────────── Login / Register ────────────────────────── */

function EconLogin({
  onSignedIn,
  onBack,
}: {
  onSignedIn: (s: EconSession) => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const session =
        mode === 'login' ? await login(username, password) : await register(username, password)
      onSignedIn(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <div className="econ-login">
      <button type="button" className="econ-login-back" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" /> Home
      </button>
      <form className="econ-login-card" onSubmit={submit}>
        <h1 className="econ-login-title">Adam</h1>
        <p className="econ-login-sub">
          {mode === 'login' ? 'Log in to your whiteboard.' : 'Make an account on this laptop.'}
        </p>

        <label className="econ-field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            placeholder="e.g. adamsmith"
            maxLength={20}
          />
        </label>
        <label className="econ-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
          />
        </label>

        {error && <p className="econ-login-error">{error}</p>}

        <button
          type="submit"
          className="econ-login-submit"
          disabled={busy || !username.trim() || !password}
        >
          {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <button
          type="button"
          className="econ-login-switch"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'))
            setError(null)
          }}
        >
          {mode === 'login' ? (
            <>
              New here? <u>Create an account</u>
            </>
          ) : (
            <>
              Already have an account? <u>Log in</u>
            </>
          )}
        </button>
      </form>
    </div>
  )
}

/* ────────────────────────── Boards dropdown ────────────────────────── */

function BoardMenu({
  boards,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  username,
  onSignOut,
}: {
  boards: EconBoard[]
  activeId: string
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  username: string
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const active = boards.find((b) => b.id === activeId)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setRenamingId(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const commitRename = () => {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  return (
    <div className="econ-board-menu" ref={ref}>
      <button type="button" className="econ-board-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="econ-board-trigger-name">{active?.name ?? 'Whiteboards'}</span>
        <ChevronDown size={13} className={open ? 'econ-rot' : ''} />
      </button>

      {open && (
        <div className="econ-board-pop">
          <div className="econ-board-pop-head">
            <span>My whiteboards</span>
            <button
              type="button"
              onClick={() => {
                onCreate()
                setOpen(false)
              }}
            >
              <Plus size={12} /> New board
            </button>
          </div>
          <div className="econ-board-pop-list">
            {boards.map((b) => {
              const isActive = b.id === activeId
              const isRenaming = renamingId === b.id
              return (
                <div key={b.id} className={`econ-board-row${isActive ? ' is-active' : ''}`}>
                  {isRenaming ? (
                    <>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                      />
                      <button type="button" onClick={commitRename} title="Save name">
                        <Check size={12} />
                      </button>
                      <button type="button" onClick={() => setRenamingId(null)} title="Cancel">
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="econ-board-row-name"
                        onClick={() => {
                          onSelect(b.id)
                          setOpen(false)
                        }}
                      >
                        {b.name}
                      </button>
                      <button
                        type="button"
                        className="econ-board-row-icon"
                        title="Rename"
                        onClick={() => {
                          setRenamingId(b.id)
                          setRenameValue(b.name)
                        }}
                      >
                        <Pencil size={11} />
                      </button>
                      {boards.length > 1 && (
                        <button
                          type="button"
                          className="econ-board-row-icon econ-board-row-delete"
                          title="Delete board"
                          onClick={() => {
                            if (window.confirm(`Delete "${b.name}"? Its ink is gone for good.`)) {
                              onDelete(b.id)
                            }
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <div className="econ-board-pop-foot">
            <span>{username}</span>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
            >
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ────────────────────────── Whiteboard host ────────────────────────── */

function EconBoardCanvas({
  boardId,
  onVoiceAvailabilityChange,
}: {
  boardId: string
  onVoiceAvailabilityChange?: (available: boolean) => void
}) {
  const [hasContent, setHasContent] = useState(false)

  return (
    <div className="econ-board-wrap">
      <ReactFlow
        nodes={[]}
        edges={[]}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.15}
        panOnDrag={[0, 1]}
        panOnScroll
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
        zoomOnPinch
        // Board content persists per boardId — remount cleanly on switch.
        key={boardId}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(0,0,0,0.10)" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {!hasContent && (
        <div className="econ-empty">
          <div className="econ-empty-inner">
            <p className="econ-empty-title">Start with a graph or equation</p>
            <p className="econ-empty-sub">
              Draw a graph or write an equation. Or tap Draw with Adam and draw it together.
            </p>
          </div>
        </div>
      )}

      <MathLayer
        adventureId={boardId}
        onHasContentChange={setHasContent}
        onVoiceAvailabilityChange={onVoiceAvailabilityChange}
        competition
      />
    </div>
  )
}

/* ────────────────────────── Signed-in shell ────────────────────────── */

function EconStudio({
  session,
  onSignOut,
  onGoHome,
}: {
  session: EconSession
  onSignOut: () => void
  onGoHome: () => void
}) {
  const [boards, setBoards] = useState<EconBoard[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const welcomeStorageKey = `econ-welcome-seen:${session.username.toLowerCase()}`
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      return window.sessionStorage.getItem(welcomeStorageKey) !== '1'
    } catch {
      return true
    }
  })
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  // The board id whose server snapshot has been pulled into local storage.
  // MathLayer only mounts once its board is ready, so it never restores stale ink.
  const [readyBoardId, setReadyBoardId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<BoardSyncStatus | 'idle'>('idle')
  const boardIdsRef = useRef<Set<string>>(new Set())
  const savedHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Boards known to have real content this session (from the server snapshot or
  // a local save). Empty saves for boards NOT in here are never pushed — they
  // carry no information and could clobber a good server copy after a failed
  // seed fetch or an unload race. Erasing a board you actually worked on
  // (id present here) still syncs, so deliberate clears propagate.
  const hadContentRef = useRef<Set<string>>(new Set())

  // Set scope before paint/children — clearing it on unmount used to route
  // saves into a guest key, so refresh showed the old server board.
  useLayoutEffect(() => {
    setMathBoardUserScope(`econ:${session.username.toLowerCase()}`)
  }, [session.username])

  // Load the board list from the server (uploading any local-only boards).
  useEffect(() => {
    let cancelled = false
    void loadBoardsRemote(session).then((list) => {
      if (cancelled) return
      setBoards(list)
      const remembered = readActiveBoardId(session.username)
      const pick =
        (remembered && list.some((b) => b.id === remembered) ? remembered : null) ??
        list[0]?.id ??
        null
      setActiveId((cur) => cur ?? pick)
    })
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    boardIdsRef.current = new Set((boards ?? []).map((b) => b.id))
  }, [boards])

  // Every local board save is mirrored to the server — auto-save all boards.
  useEffect(() => {
    const prefix = `econ-${session.username.toLowerCase()}-`
    return onMathBoardSaved((boardId, snapshot) => {
      // Accept known boards, or any board id for this account (list may still
      // be loading when the first stroke persists).
      if (!boardIdsRef.current.has(boardId) && !boardId.startsWith(prefix)) return
      const hasInk =
        snapshot.strokes.length > 0 ||
        snapshot.images.length > 0 ||
        !!(snapshot.prompt && snapshot.prompt.trim())
      if (hasInk) hadContentRef.current.add(boardId)
      else if (!hadContentRef.current.has(boardId)) return // uninformative empty save
      pushBoardData(session, boardId, snapshot)
    })
  }, [session])

  // Top-right save indicator (Saving… / Saved / error).
  useEffect(() => {
    return onBoardSyncStatus((status) => {
      if (savedHideTimer.current) {
        clearTimeout(savedHideTimer.current)
        savedHideTimer.current = null
      }
      setSyncStatus(status)
      if (status === 'saved') {
        savedHideTimer.current = setTimeout(() => {
          setSyncStatus('idle')
          savedHideTimer.current = null
        }, 2200)
      }
    })
  }, [])

  useEffect(() => {
    return () => {
      if (savedHideTimer.current) clearTimeout(savedHideTimer.current)
    }
  }, [])

  // Before showing a board, pull its server snapshot into the browser cache
  // (newest copy wins) so work follows the account across devices.
  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    setReadyBoardId(null)
    void fetchBoardData(session, activeId).then((snap) => {
      if (cancelled) return
      if (snap) {
        if ((snap.strokes?.length ?? 0) > 0 || (snap.images?.length ?? 0) > 0) {
          hadContentRef.current.add(activeId)
        }
        const seed = seedMathBoard(activeId, snap)
        // Browser copy was ahead of the server (failed/late push) — heal the server copy.
        if (seed === 'kept-local') {
          const local = loadMathBoard(activeId, [], { adoptOrphans: false })
          if (local) pushBoardData(session, activeId, local)
        }
      }
      setReadyBoardId(activeId)
    })
    return () => {
      cancelled = true
    }
  }, [session, activeId])

  useEffect(() => {
    if (activeId) writeActiveBoardId(session.username, activeId)
  }, [session.username, activeId])

  const handleCreate = useCallback(() => {
    setBoards((prev) => {
      const next = createBoard(session, prev ?? [])
      setActiveId(next[next.length - 1].id)
      return next
    })
  }, [session])

  const handleDelete = useCallback(
    (id: string) => {
      setBoards((prev) => {
        const next = deleteBoard(session, prev ?? [], id)
        if (id === activeId && next.length > 0) setActiveId(next[0].id)
        return next
      })
    },
    [session, activeId]
  )

  const handleRename = useCallback(
    (id: string, name: string) => {
      setBoards((prev) => renameBoard(session, prev ?? [], id, name))
    },
    [session]
  )

  useEffect(() => {
    if (!welcomeOpen) return
    try {
      window.sessionStorage.setItem(welcomeStorageKey, '1')
    } catch {
      // The screen still works when storage is unavailable.
    }
  }, [welcomeOpen, welcomeStorageKey])

  const handleWelcomeUpload = useCallback((file: File) => {
    setWelcomeOpen(false)
    window.dispatchEvent(new CustomEvent<File>('econ:place-image', { detail: file }))
  }, [])

  const handleWelcomeDismiss = useCallback(() => setWelcomeOpen(false), [])

  const handleWelcomeAsk = useCallback(() => {
    setWelcomeOpen(false)
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('econ:focus-question')))
  }, [])

  const handleWelcomeLesson = useCallback((lessonId: string) => {
    setWelcomeOpen(false)
    window.requestAnimationFrame(() =>
      window.dispatchEvent(new CustomEvent<string>('econ:start-lesson', { detail: lessonId }))
    )
  }, [])

  return (
    <div className="econ-shell">
      <main className="econ-main">
        <div className="econ-float" data-html2canvas-ignore>
          <div className="econ-float-left card">
            <button
              type="button"
              className="econ-float-home"
              onClick={onGoHome}
              aria-label="Home"
              title="Home"
            >
              <Home size={16} aria-hidden="true" />
            </button>
            <BoardMenu
              boards={boards ?? []}
              activeId={activeId ?? ''}
              onSelect={setActiveId}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
              username={session.username}
              onSignOut={onSignOut}
            />
          </div>

          <div className="econ-float-right">
            {syncStatus !== 'idle' && (
              <div
                className={`econ-sync-status is-${syncStatus}`}
                aria-live="polite"
                title={
                  syncStatus === 'saving'
                    ? 'Saving to this computer…'
                    : syncStatus === 'saved'
                      ? 'Saved'
                      : 'Couldn’t save. Is the local server running?'
                }
              >
                {syncStatus === 'saving' && (
                  <>
                    <Loader2 size={13} className="econ-sync-spin" aria-hidden />
                    <span>Saving…</span>
                  </>
                )}
                {syncStatus === 'saved' && (
                  <>
                    <Check size={13} aria-hidden />
                    <span>Saved</span>
                  </>
                )}
                {syncStatus === 'error' && (
                  <>
                    <CloudOff size={13} aria-hidden />
                    <span>Not saved</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {activeId && readyBoardId === activeId ? (
          <ReactFlowProvider>
            <EconBoardCanvas boardId={activeId} onVoiceAvailabilityChange={setVoiceEnabled} />
          </ReactFlowProvider>
        ) : (
          <div className="econ-board-loading">
            <span>Loading your whiteboard…</span>
          </div>
        )}
      </main>
      {welcomeOpen && activeId && readyBoardId === activeId && (
        <WelcomeScreen
          showMicHint={voiceEnabled}
          onDismiss={handleWelcomeDismiss}
          onUploadFile={handleWelcomeUpload}
          onAskQuestion={handleWelcomeAsk}
          onStartLesson={handleWelcomeLesson}
        />
      )}
    </div>
  )
}

/* ────────────────────────── Root ────────────────────────── */

export default function EconApp() {
  const [session, setSession] = useState<EconSession | null>(() => getStoredSession())
  const [checking, setChecking] = useState(() => !!getStoredSession())
  const [landingOpen, setLandingOpen] = useState(() => {
    try {
      return window.sessionStorage.getItem(LANDING_SEEN_KEY) !== '1'
    } catch {
      return true
    }
  })

  const handleLandingStart = useCallback(() => {
    try {
      window.sessionStorage.setItem(LANDING_SEEN_KEY, '1')
      Object.keys(window.sessionStorage)
        .filter((key) => key.startsWith('econ-welcome-seen:'))
        .forEach((key) => window.sessionStorage.removeItem(key))
    } catch {
      // The landing page shows again next load when storage is unavailable.
    }
    setLandingOpen(false)
  }, [])

  const handleGoHome = useCallback(() => setLandingOpen(true), [])

  // The store is created with skipHydration (the studio's AuthProvider normally
  // hydrates it). Econ Coach has its own auth, so hydrate here — MathLayer refuses to
  // load/save board ink until the store reports hydrated.
  useEffect(() => {
    if (!useStore.persist.hasHydrated()) void useStore.persist.rehydrate()
  }, [])

  // Revalidate a stored token once on load; drop it if the server rejects it.
  useEffect(() => {
    const stored = getStoredSession()
    if (!stored) return
    let cancelled = false
    void validateSession(stored).then((ok) => {
      if (cancelled) return
      if (!ok) setSession(null)
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSignOut = useCallback(() => {
    void logout(session)
    setMathBoardUserScope(null)
    setSession(null)
  }, [session])

  if (landingOpen) return <LandingPage onStart={handleLandingStart} />
  if (!session) return <EconLogin onSignedIn={setSession} onBack={handleGoHome} />
  if (checking) {
    return (
      <div className="econ-login">
        <span className="econ-login-title">Adam</span>
      </div>
    )
  }
  return (
    <EconStudio
      key={session.username}
      session={session}
      onSignOut={handleSignOut}
      onGoHome={handleGoHome}
    />
  )
}
