import { create } from 'zustand'

export interface AppUpdateState {
  current: string | null
  latest: string | null
  hasUpdate: boolean
  releaseUrl: string | null
  publishedAt: string | null
  notes: string | null
  checkedAt: string | null
  error: string | null
  checking: boolean
  dismissedFor: string | null

  check: () => Promise<void>
  dismiss: () => void
  openRelease: () => void
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  current: null,
  latest: null,
  hasUpdate: false,
  releaseUrl: null,
  publishedAt: null,
  notes: null,
  checkedAt: null,
  error: null,
  checking: false,
  dismissedFor: null,

  check: async () => {
    if (get().checking) return
    set({ checking: true })
    try {
      const info = await window.api.updates.check()
      set({
        current: info.current,
        latest: info.latest,
        hasUpdate: info.hasUpdate,
        releaseUrl: info.releaseUrl,
        publishedAt: info.publishedAt,
        notes: info.notes,
        checkedAt: info.checkedAt,
        error: info.error,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ checking: false })
    }
  },

  dismiss: () => {
    const latest = get().latest
    if (latest) set({ dismissedFor: latest })
  },

  openRelease: () => {
    const url = get().releaseUrl
    if (url) window.api.system.openExternal(url)
  },
}))
