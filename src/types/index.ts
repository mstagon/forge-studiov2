export interface TerminalTab {
  id: string
  title: string
  ptyId: string | null
  cwd: string
  /** Workspace this tab belongs to. Tabs are filtered by activeWorkspace.id in
   *  the main TerminalPanel; tabs without a workspaceId (legacy / unattached)
   *  show in every workspace as a fallback. */
  workspaceId?: string
  /** When set, this tab attaches to a single agent team's tmux pane instead of
   *  spawning a local shell. */
  agent?: TerminalAgentBinding
  /** When set, this tab is a multi-agent split layout for the named team —
   *  each leaf pane carries its own `pane.agent` binding. */
  teamId?: string
  panes: TerminalPane[]
  activePaneId: string
}

export interface TerminalAgentBinding {
  teamId: string
  agentName: string
  tmuxPaneId: string
}

export interface TerminalPane {
  id: string
  ptyId: string | null
  direction?: 'horizontal' | 'vertical'
  children?: TerminalPane[]
  size?: number // percentage
  /** When set on a leaf pane, overrides the tab-level agent binding so each
   *  pane in a split-team layout can attach to a different agent's tmux pane. */
  agent?: TerminalAgentBinding
}

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: string
  lastOpened: string
  harnessApplied: boolean
}

export interface HarnessInfo {
  agents: { name: string; file: string }[]
  skills: { name: string; file: string }[]
  commands: { name: string; file: string }[]
  scripts: { name: string; file: string }[]
  rules: { name: string; file: string }[]
  mcpServers: { name: string; enabled: boolean; type: string }[]
  hooks: Record<string, number>
}

export interface McpStatus {
  name: string
  status: string
  command?: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  parents: string[]
  message: string
  author: string
  email: string
  date: string
  refs: string[]
}

export interface GitFileChange {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?'
  oldPath?: string
}

export interface GitStatus {
  branch: string
  upstream: string
  ahead: number
  behind: number
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
  isRepo: boolean
}

export interface GitBranch {
  name: string
  current: boolean
  remote: string
  lastCommitHash: string
  lastCommitMsg: string
}

export type AgentStatus = 'running' | 'idle' | 'shutdown'

export interface TeamMember {
  agentId: string
  name: string
  agentType: string
  model: string
  cwd?: string
  tmuxPaneId?: string
  backendType?: string
  joinedAt: number
  color?: string
  status: AgentStatus
  lastActivityAt: string | null
  lastSummary: string | null
  messageCount: number
  unreadCount: number
  isLead: boolean
}

export interface Team {
  id: string
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  members: TeamMember[]
}

export type SidebarView = 'workspaces' | 'git' | 'teams' | 'dashboard' | 'settings'
export type Theme = 'dark' | 'light'

declare global {
  interface Window {
    api: import('../../electron/preload').StudioAPI
  }
}
