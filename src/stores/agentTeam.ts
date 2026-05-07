import { create } from 'zustand'
import type { Team, TeamCreateOptions, TeamCreateResult, MergeResult } from '@/types'

/**
 * Type guards for optional IPC methods. W1 ships pause/resume/merge via
 * `window.api.teams.*`, but until that lands the store gracefully no-ops
 * instead of throwing — this keeps the renderer typecheck-clean even when
 * the worker is mid-flight.
 */
type TeamsApi = Window['api']['teams'] & {
  pause?: (teamId: string) => Promise<void>
  resume?: (teamId: string) => Promise<void>
  pauseMember?: (teamId: string, agentId: string) => Promise<void>
  resumeMember?: (teamId: string, agentId: string) => Promise<void>
  merge?: (teamId: string) => Promise<MergeResult>
}

function teamsApi(): TeamsApi {
  return window.api.teams as TeamsApi
}

interface AgentTeamState {
  teams: Team[]
  loaded: boolean
  unsubscribe: (() => void) | null

  load: () => Promise<void>
  subscribe: () => void
  unsubscribeAll: () => void
  /** Create a new team and refresh the list. The watcher will eventually push
   *  the same data via `onUpdate`, but we re-fetch here so callers get
   *  immediate consistency without waiting for the next chokidar tick.
   *  Returns the full create envelope (incl. worktreesCreated /
   *  tmuxSessionsStarted when W1 has wired them) so callers can render rich
   *  toast feedback. Falls back to a partial shape if the IPC handler still
   *  returns the legacy `{teamId, configPath}` envelope. */
  create: (opts: TeamCreateOptions) => Promise<TeamCreateResult>
  /** Delete a team config (worktrees / inboxes go too). */
  remove: (teamId: string) => Promise<void>
  /** Pause a whole team (lifecycle: active → paused). */
  pause: (teamId: string) => Promise<void>
  /** Resume a paused team. */
  resume: (teamId: string) => Promise<void>
  /** Pause a single member's tmux pane / agent loop. */
  pauseMember: (teamId: string, agentId: string) => Promise<void>
  /** Resume a single member. */
  resumeMember: (teamId: string, agentId: string) => Promise<void>
  /** Trigger the merge pipeline for a team. Returns the MergeResult so the
   *  caller can drive a `MergeConflictView` (W2) when `ok === false`. */
  merge: (teamId: string) => Promise<MergeResult>
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
    // chokidar push covers both content (config.json) AND status changes —
    // AgentTeamWatcher recomputes status on every refresh tick, so a single
    // onUpdate stream is enough to pick up pause/resume transitions.
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
    const result = (await window.api.teams.create(opts)) as Partial<TeamCreateResult> & {
      teamId: string
      configPath: string
    }
    await get().load()
    // Normalise: legacy backend returns {teamId, configPath} only.
    return {
      teamId: result.teamId,
      configPath: result.configPath,
      worktreesCreated: result.worktreesCreated ?? 0,
      tmuxSessionsStarted: result.tmuxSessionsStarted ?? 0,
    }
  },

  remove: async (teamId: string) => {
    await window.api.teams.remove(teamId)
    await get().load()
  },

  pause: async (teamId: string) => {
    const fn = teamsApi().pause
    if (!fn) {
      console.warn('[agentTeam] pause: IPC not yet wired (W1 in flight)')
      return
    }
    await fn(teamId)
    await get().load()
  },

  resume: async (teamId: string) => {
    const fn = teamsApi().resume
    if (!fn) {
      console.warn('[agentTeam] resume: IPC not yet wired (W1 in flight)')
      return
    }
    await fn(teamId)
    await get().load()
  },

  pauseMember: async (teamId: string, agentId: string) => {
    const fn = teamsApi().pauseMember
    if (!fn) {
      console.warn('[agentTeam] pauseMember: IPC not yet wired (W1 in flight)')
      return
    }
    await fn(teamId, agentId)
    await get().load()
  },

  resumeMember: async (teamId: string, agentId: string) => {
    const fn = teamsApi().resumeMember
    if (!fn) {
      console.warn('[agentTeam] resumeMember: IPC not yet wired (W1 in flight)')
      return
    }
    await fn(teamId, agentId)
    await get().load()
  },

  merge: async (teamId: string): Promise<MergeResult> => {
    const fn = teamsApi().merge
    if (!fn) {
      console.warn('[agentTeam] merge: IPC not yet wired (W1 in flight)')
      return { ok: false, error: 'merge IPC not available', conflicts: [] }
    }
    const result = await fn(teamId)
    await get().load()
    return result
  },
}))
