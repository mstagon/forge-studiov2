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

/**
 * Split-repo settings forwarded from the New Workspace dialog through the
 * `workspace:create` IPC. When `enabled`, WorkspaceManager registers three
 * git remotes (`origin-client`, `origin-server`, `origin-cms`) on the new
 * monorepo so the user can later run `git subtree push` per stack.
 */
export interface SplitReposOptions {
  enabled: boolean
  baseName: string
  owner?: string
  protocol?: 'ssh' | 'https'
  autoCreateRepos?: boolean
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

export type AgentStatus = 'running' | 'idle' | 'shutdown' | 'paused' | 'active'
export type TeamStatus = 'active' | 'paused'
export type WorktreeStrategy = 'isolated' | 'shared'
export type MergeStrategy = 'squash' | 'sequential'

export interface TeamCreateResult {
  teamId: string
  configPath: string
  worktreesCreated: number
  tmuxSessionsStarted: number
}

/**
 * Single-file merge conflict surfaced by `teams:merge`. The renderer uses
 * `conflictMarkers` to render an inline diff in `MergeConflictView` (W2).
 */
export interface MergeConflict {
  file: string
  theirsBranch: string
  oursBranch: string
  conflictMarkers: string
}

/**
 * Result envelope for `teams:merge`. On success exposes the resulting branch
 * + commit sha; on conflict surfaces a list of `MergeConflict` for the UI.
 *
 * Shape was deliberately chosen to be flat (one record, optional fields)
 * instead of a discriminated union so renderer code can `result.ok &&
 * result.commitSha` without narrowing acrobatics.
 */
export interface MergeResult {
  ok: boolean
  mergedBranch?: string
  commitSha?: string
  conflicts?: MergeConflict[]
  error?: string
}

/** @deprecated alias for `MergeConflict` — kept for any in-flight callers. */
export type TeamMergeConflict = MergeConflict

/** @deprecated alias for `MergeResult` — kept for any in-flight callers. */
export type TeamMergeResult = MergeResult

export interface TeamMergeOptions {
  mergeStrategy?: MergeStrategy
}

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
  /** Optional task assigned to this member at create time. */
  task?: string
  /** Per-member worktree path (when isolated worktrees are provisioned). */
  worktreePath?: string
  branch?: string
  /**
   * Member-level lifecycle state, set by pauseMember/resumeMember on the
   * backend. `'idle'` here means "explicitly paused" (semantically distinct
   * from the inbox-derived idle status). The renderer surfaces this as a
   * 'paused' member state so Pause/Resume controls stay correct.
   */
  state?: 'active' | 'idle'
}

export interface Team {
  id: string
  name: string
  description?: string
  goal?: string
  /** Workspace this team belongs to (only set for workspace-scoped teams).
   *  Note: forge-team CLI 에서 만든 팀은 workspaceId 가 path basename 일
   *  수도 있다 (UUID 아님) — 매칭은 workspacePath 기준이 안전. */
  workspaceId?: string
  /** Absolute workspace path. forge-team CLI 가 항상 채워서 path 매칭으로
   *  정확한 워크스페이스 scoping 가능. UUID 모르는 외부 호출자도 정확. */
  workspacePath?: string
  worktreeStrategy?: WorktreeStrategy
  mergeStrategy?: MergeStrategy
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  members: TeamMember[]
  /** Lifecycle status — 'active' | 'paused'. Absent = active. */
  status?: TeamStatus
}

export interface TeamCreateMember {
  agentId: string
  task?: string
  /** Provider model id (claude-opus-4-7 / gpt-5.5 / etc). 멤버 spawn 시
   *  ProviderRouter 가 해당 CLI 로 dispatch. 미지정 시 claude default. */
  model?: string
}

export interface TeamCreateOptions {
  workspaceId: string
  workspacePath: string
  name: string
  goal?: string
  members: TeamCreateMember[]
  worktreeStrategy: WorktreeStrategy
  mergeStrategy: MergeStrategy
  /** 협의 모드 (Council) — 멤버 inbox 에 협의 지시 자동 작성. */
  council?: boolean
}

export type SidebarView = 'workspaces' | 'git' | 'teams' | 'dashboard' | 'settings'
export type Theme = 'dark' | 'light'

declare global {
  interface Window {
    api: import('../../electron/preload').StudioAPI
  }
}
