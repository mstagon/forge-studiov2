/**
 * teamActivity store — pulls historical events from
 * `window.api.teamActivity.list(teamId)` and overlays live pushes from
 * `onEvent`. Each team holds its own bounded ring (newest first, max 200)
 * so RunLiveView's feed never grows unbounded over a long-running team.
 *
 * Subscription is reference-counted: if two views ask for the same team,
 * we share a single onEvent handler. A subscriber is only torn down when
 * the last consumer unsubscribes.
 */
import { create } from 'zustand'

export type ActivityKind = 'edit' | 'commit' | 'state-change'

export interface ActivityEntry {
  ts: number
  teamId: string
  agent: string
  kind: ActivityKind
  file?: string
  added?: number
  removed?: number
  message?: string
  files?: string[]
  sha?: string
  from?: string
  to?: string
  text?: string
}

const MAX_PER_TEAM = 200

interface TeamActivityState {
  /** entries[teamId] is sorted newest-first. */
  entries: Record<string, ActivityEntry[]>
  /** Per-team subscriber refcount (so multiple consumers share one IPC handler). */
  subscriberCounts: Record<string, number>
  /** The single global IPC unsubscribe — set once on first subscribe(). */
  globalOff: (() => void) | null

  subscribe: (teamId: string) => Promise<void>
  unsubscribe: (teamId: string) => void
  /** Internal: ingest a single event. Exported on the store so tests can poke it. */
  ingest: (event: ActivityEntry) => void
  /** Drop all entries for a team — used when teams are removed. */
  clear: (teamId: string) => void
}

function pushBounded(list: ActivityEntry[], event: ActivityEntry): ActivityEntry[] {
  const next = [event, ...list]
  if (next.length > MAX_PER_TEAM) next.length = MAX_PER_TEAM
  return next
}

export const useTeamActivityStore = create<TeamActivityState>((set, get) => ({
  entries: {},
  subscriberCounts: {},
  globalOff: null,

  ingest: (event: ActivityEntry) => {
    if (!event || !event.teamId) return
    set((s) => {
      const cur = s.entries[event.teamId] ?? []
      return {
        entries: {
          ...s.entries,
          [event.teamId]: pushBounded(cur, event),
        },
      }
    })
  },

  subscribe: async (teamId: string) => {
    if (!teamId) return
    const api = window.api?.teamActivity
    // Bump the per-team refcount and lazily attach the global onEvent
    // listener exactly once.
    const counts = get().subscriberCounts
    set({
      subscriberCounts: { ...counts, [teamId]: (counts[teamId] ?? 0) + 1 },
    })
    if (!get().globalOff && typeof api?.onEvent === 'function') {
      const off = api.onEvent((event) => {
        // Filter inside the store so a single channel can fan out to N teams.
        get().ingest(event as ActivityEntry)
      })
      set({ globalOff: off })
    }

    // Hydrate the team's history if we don't already have it. Failures here
    // are non-fatal — the live stream will populate over time.
    if (!get().entries[teamId] && typeof api?.list === 'function') {
      try {
        const past = await api.list(teamId, MAX_PER_TEAM)
        const sorted = (past as ActivityEntry[])
          .slice()
          .sort((a, b) => b.ts - a.ts)
          .slice(0, MAX_PER_TEAM)
        set((s) => ({
          entries: { ...s.entries, [teamId]: sorted },
        }))
      } catch (err) {
        console.warn('[teamActivity] list failed:', err)
        set((s) => ({
          entries: { ...s.entries, [teamId]: s.entries[teamId] ?? [] },
        }))
      }
    }
  },

  unsubscribe: (teamId: string) => {
    if (!teamId) return
    const counts = get().subscriberCounts
    const cur = counts[teamId] ?? 0
    const next = Math.max(0, cur - 1)
    const updated = { ...counts, [teamId]: next }
    if (next === 0) delete updated[teamId]
    set({ subscriberCounts: updated })

    // Tear down the global listener only when no team has any subscriber.
    const stillActive = Object.values(updated).some((n) => n > 0)
    if (!stillActive) {
      const off = get().globalOff
      if (off) off()
      set({ globalOff: null })
    }
  },

  clear: (teamId: string) => {
    if (!teamId) return
    set((s) => {
      const next = { ...s.entries }
      delete next[teamId]
      return { entries: next }
    })
  },
}))
