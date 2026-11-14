/**
 * Minimal local store for the Econ Coach whiteboard.
 *
 * The original app shared a large cloud-synced workspace store with the
 * whiteboard. This build is fully local and the whiteboard only ever read
 * three things from it (an optional API key, the adventure list, and the
 * persist/hydration handshake), so this file keeps just that surface. Nothing
 * here touches the network, and boards persist through `mathBoardStorage`.
 */
import { create } from 'zustand'

export interface Adventure {
  id: string
}

interface StoreState {
  /** Unused in the local build (no cloud model, so no key). Kept for call-site compatibility. */
  apiKey: string
  adventures: Adventure[]
}

type HydrationListener = () => void

const base = create<StoreState>(() => ({
  apiKey: '',
  adventures: [],
}))

let hydrated = false
const listeners = new Set<HydrationListener>()

/** Same shape as zustand's persist API, backed by nothing: hydration is instant. */
const persistApi = {
  hasHydrated: () => hydrated,
  rehydrate: async () => {
    if (hydrated) return
    hydrated = true
    for (const cb of [...listeners]) cb()
  },
  onFinishHydration: (cb: HydrationListener) => {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  },
}

export const useStore = Object.assign(base, { persist: persistApi })
