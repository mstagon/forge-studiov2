import { create } from 'zustand'
import type { Team, TeamCreateOptions } from '@/types'

interface AgentTeamState {
  teams: Team[]
  loaded: boolean
  unsubscribe: (() => void) | null

  load: () => Promise<void>
  subscribe: () => void
  unsubscribeAll: () => void
  /** Create a new team and refresh the list. The watcher will eventually push
   *  the same data via `onUpdate`, but we re-fetch here so callers get
   *  immediate consistency without waiting for the next chokidar tick. */
  create: (opts: TeamCreateOptions) => Promise<{ teamId: string; configPath: string }>
  /** Delete a team config (worktrees / inboxes go too). */
  remove: (teamId: string) => Promise<void>
}

export const useAgentTeamStore = create<AgentTeamState>((set, get) => ({
  teams: [],
  loaded: false,
  unsubscribe: null,

  load: async () => {
    try {
      const teams = (await window.api.teams.list()) as Team[]
      set({ teams, loaded: true })
    } catch (err) {
      console.error('[agentTeam] load failed:', err)
      set({ teams: [], loaded: true })
    }
  },

  subscribe: () => {
    if (get().unsubscribe) return
    const off = window.api.teams.onUpdate((teams) => {
      set({ teams: teams as Team[], loaded: true })
    })
    set({ unsubscribe: off })
  },

  unsubscribeAll: () => {
    const off = get().unsubscribe
    if (off) off()
    set({ unsubscribe: null })
  },

  create: async (opts: TeamCreateOptions) => {
    const result = await window.api.teams.create(opts)
    await get().load()
    return result
  },

  remove: async (teamId: string) => {
    await window.api.teams.remove(teamId)
    await get().load()
  },
}))
