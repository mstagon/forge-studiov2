import { create } from 'zustand'
import type { Team } from '@/types'

interface AgentTeamState {
  teams: Team[]
  loaded: boolean
  unsubscribe: (() => void) | null

  load: () => Promise<void>
  subscribe: () => void
  unsubscribeAll: () => void
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
}))
