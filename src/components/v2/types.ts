/**
 * Shared types for Forge Studio v2 UI.
 * Source: design handoff at /tmp/forge_design/forge/project/src/data.jsx
 */

export type RunState = 'active' | 'paused' | 'idle' | 'blocked' | 'done' | 'queued'
export type MemberState = 'active' | 'done' | 'blocked' | 'queued' | 'idle' | 'paused'

export interface Agent {
  id: string
  name: string
  role: string
  /** CSS color (var(--role-*) or literal) */
  color: string
  /** Single character glyph for the badge */
  icon: string
  desc: string
}

export interface TeamMember {
  agentId: string
  task: string
  state: MemberState
  tokens: number
  files: number
  pane: string
  blockedReason?: string
  /** Optional human-readable member name (used as agent identifier for tmux). */
  name?: string
  /** Optional tmux pane id — when present, the member can attach to a real
   *  terminal session via `window.api.teams.openAgentTerminal`. */
  tmuxPaneId?: string
  /** Inbox unread count — drives the AgentCard mail icon badge. */
  unreadCount?: number
  /** Provider model id (claude-opus-4-7 / gpt-5.5 / etc). Drives the model
   *  badge on AgentCard + ProviderRouter dispatch on team spawn. */
  model?: string
}

export interface Team {
  id: string
  name: string
  goal: string
  status: RunState
  progress: number
  lastActive: string
  branch: string
  worktree: 'isolated' | 'shared'
  merge: 'squash' | 'sequential' | 'manual'
  tokens: number
  durationMin: number
  members: TeamMember[]
}

export type ActivityKind =
  | 'edit'
  | 'commit'
  | 'blocked'
  | 'decision'
  | 'tool'
  | 'queued'
  | 'done'

export interface ActivityEntry {
  t: string
  agent: string
  kind: ActivityKind
  text: string
}

/** Alias kept for v2 components written before naming converged. */
export type ActivityItem = ActivityEntry

export interface WorkspaceSummary {
  id: string
  name: string
  path: string
  branch: string
  harness: string
  current?: boolean
}

export interface TerminalLine {
  c: string
  t: string
}

export type TerminalLines = Record<string, TerminalLine[]>

export type ViewKey = 'workspace' | 'git' | 'dashboard' | 'library' | 'settings'

export interface ResourceUsage {
  cpu: number
  memUsed: number
  memTotal: number
  diskDeltaGb: number
  ptyCount: number
}
