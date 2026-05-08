// liveTerminals — global active-team registry for App-level XTerminal lifetime.
//
// Why this exists: previously LiveTerminalGrid owned the SlotRegistry + portal
// hosts internally, so navigating away from RunLiveView (Library / Dashboard /
// other workspace) tore down every <XTerminal>, killed each tmux-attach PTY,
// and lost scrollback on return.
//
// This store lifts the "which team's members should currently have live PTYs"
// decision up to App, where LiveTerminalsRoot can keep the XTerminal mounts
// alive across navigation. The grid only registers slots — it never owns the
// terminals.

import { create } from 'zustand'

/**
 * Structural subset of the v2 TeamMember shape — only the fields
 * LiveTerminalsRoot actually needs to decide whether to mount an XTerminal.
 * Decoupled from `@/types` so renderer and v2 chrome can both push into
 * this store without converting between TeamMember shapes.
 */
export interface LiveMemberRef {
  agentId: string
  name?: string
  tmuxPaneId?: string
  /** v2 MemberState string; we only care about 'queued' to skip mounting. */
  state?: string
}

export interface ActiveLiveTeam {
  teamId: string
  /** Snapshot of members eligible for live PTY at the time of registration. */
  members: LiveMemberRef[]
}

interface LiveTerminalsState {
  active: ActiveLiveTeam | null
  /**
   * Set/replace the currently focused team. Calling with the same teamId
   * reuses existing host elements (members array drives current PTY set).
   * Calling with a different teamId tears down the old team's terminals.
   */
  setActiveTeam(team: ActiveLiveTeam | null): void
  /** Clear all live terminals — used on workspace swap or app shutdown. */
  clear(): void
}

export const useLiveTerminalsStore = create<LiveTerminalsState>((set) => ({
  active: null,
  setActiveTeam(team) {
    set({ active: team })
  },
  clear() {
    set({ active: null })
  },
}))
