import * as chokidar from 'chokidar'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { EventEmitter } from 'events'
import { pathManager } from './PathManager'
import {
  TeamOperations,
  type RawConfig,
  type TeamCreateOptions as OpsCreateOptions,
  type TeamCreateResult as OpsCreateResult,
  type TeamMergeOptions as OpsMergeOptions,
  type TeamMergeResult as OpsMergeResult,
  type TeamMergeConflict as OpsMergeConflict,
} from './TeamOperations'

/**
 * Resolve the tmux binary at call time. Falls back to PATH `tmux` so the
 * watcher still works on dev hosts that haven't downloaded the bundle.
 */
function tmuxBin(): string {
  return pathManager.getTmux() ?? 'tmux'
}

/** Build an env that includes bundled bin/ on PATH for tmux subprocesses. */
function tmuxEnv(): NodeJS.ProcessEnv {
  return pathManager.augmentEnv({ ...process.env })
}

export type AgentStatus = 'running' | 'idle' | 'shutdown' | 'paused' | 'active'
export type TeamStatus = 'active' | 'paused' | 'done'
export type WorktreeStrategy = 'isolated' | 'shared'
export type MergeStrategy = 'squash' | 'sequential'

export interface TeamCreateMember {
  agentId: string
  task?: string
}

// Re-export the ops shapes so existing IPC handlers / consumers keep their
// import sites stable. The watcher delegates to TeamOperations under the hood.
export type TeamCreateOptions = OpsCreateOptions
export type TeamCreateResult = OpsCreateResult
export type TeamMergeOptions = OpsMergeOptions
export type TeamMergeResult = OpsMergeResult
export type TeamMergeConflict = OpsMergeConflict
export type { TeamSummary } from './TeamOperations'

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
  task?: string
  worktreePath?: string
  branch?: string
  /** Member-level lifecycle state set by pauseMember/resumeMember. */
  state?: 'active' | 'idle'
}

export interface Team {
  id: string
  name: string
  description?: string
  goal?: string
  workspaceId?: string
  /** Absolute workspace path. App.tsx 가 path 매칭으로 워크스페이스 scoping
   *  — forge-team CLI 가 UUID 모르고 basename 만 알기 때문. */
  workspacePath?: string
  worktreeStrategy?: WorktreeStrategy
  mergeStrategy?: MergeStrategy
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  members: TeamMember[]
  status?: TeamStatus
  /** Council 모드 (round-robin 토론) — RunLiveView 의 토론 탭 표시 조건. */
  council?: boolean
}

interface InboxMessage {
  from: string
  text: string
  summary?: string
  timestamp: string
  color?: string
  read?: boolean
}

export class AgentTeamWatcher extends EventEmitter {
  /**
   * Active teams root. Defaults to ~/.claude/teams for legacy installs but is
   * normally pointed at <activeWorkspacePath>/.claude/teams via setWorkspace()
   * so each workspace has its own scoped team registry.
   */
  private teamsDir = path.join(os.homedir(), '.claude', 'teams')
  /**
   * Currently-active workspace path the watcher is scoped to. `null` means the
   * legacy `~/.claude/teams` fallback is in effect. Tracked separately from
   * teamsDir so we can hand it to TeamOperations (which expects the workspace
   * root, not the teams subdirectory).
   */
  private workspacePath: string | null = null
  private watcher: chokidar.FSWatcher | null = null
  private cache: Map<string, Team> = new Map()
  private refreshTimer: NodeJS.Timeout | null = null
  /** team:done 이벤트 중복 발사 방지. 같은 팀이 done 으로 한 번 알림 가면
   *  같은 사이클 안에서 다시 안 보냄. setWorkspace 로 워크스페이스 바뀌면 clear. */
  private notifiedDone: Set<string> = new Set()
  private readonly ops = new TeamOperations({
    tmuxBin,
    tmuxEnv,
    // Watcher-scoped teams root resolution: when the watcher has an active
    // workspace, all ops route through that workspace; otherwise legacy
    // `~/.claude/teams`. Keeps GUI parity with prior behaviour.
    teamsDirFor: (ws) =>
      ws
        ? path.join(ws, '.claude', 'teams')
        : path.join(os.homedir(), '.claude', 'teams'),
  })

  /**
   * Switch the watcher to a workspace-scoped teams directory. Safe to call
   * before or after start(); restarts the watcher when needed.
   */
  async setWorkspace(workspacePath: string | null): Promise<void> {
    const next = workspacePath
      ? path.join(workspacePath, '.claude', 'teams')
      : path.join(os.homedir(), '.claude', 'teams')
    if (next === this.teamsDir && this.watcher) return
    this.teamsDir = next
    this.workspacePath = workspacePath
    if (this.watcher) {
      await this.watcher.close().catch(() => {})
      this.watcher = null
    }
    this.cache = new Map()
    this.notifiedDone.clear()
    await this.start()
    // Notify listeners so the renderer drops stale teams from the previous ws.
    this.emit('teams', this.list())
  }

  async start(): Promise<void> {
    if (this.watcher) return
    try {
      await fs.mkdir(this.teamsDir, { recursive: true })
    } catch {
      // ignore
    }
    this.watcher = chokidar.watch(this.teamsDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 3,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    })

    const trigger = () => this.scheduleRefresh()
    this.watcher
      .on('add', trigger)
      .on('change', trigger)
      .on('unlink', trigger)
      .on('addDir', trigger)
      .on('unlinkDir', trigger)

    // Initial population (chokidar fires `add` for everything at startup
    // anyway, but this guarantees the cache is populated for the first
    // teams:list call regardless of timing).
    await this.refresh()
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      this.refresh()
        .then(() => this.emit('teams', this.list()))
        .catch(() => {})
    }, 120)
  }

  private async refresh(): Promise<void> {
    try {
      const dirs = await fs.readdir(this.teamsDir)
      const next = new Map<string, Team>()
      for (const dir of dirs) {
        const team = await this.loadTeam(dir).catch(() => null)
        if (team) next.set(dir, team)
      }
      // status: active → done 전환 감지 → team:done 이벤트 발사 (사용자에게
      // macOS 알림 + main session 의 forge-team wait CLI 가 알아챌 수 있도록)
      for (const [id, team] of next) {
        const prev = this.cache.get(id)
        if (
          team.status === 'done' &&
          (!prev || prev.status !== 'done') &&
          !this.notifiedDone.has(id)
        ) {
          this.notifiedDone.add(id)
          this.emit('team:done', team)
        }
      }
      // 사라진 팀은 알림 set 에서도 제거 (memory leak 방지)
      for (const id of this.notifiedDone) {
        if (!next.has(id)) this.notifiedDone.delete(id)
      }
      this.cache = next
    } catch {
      this.cache = new Map()
    }
  }

  private async loadTeam(id: string): Promise<Team | null> {
    const teamDir = path.join(this.teamsDir, id)
    const configPath = path.join(teamDir, 'config.json')
    let config: RawConfig
    try {
      config = JSON.parse(await fs.readFile(configPath, 'utf-8'))
    } catch {
      return null
    }
    const members: TeamMember[] = []
    for (const m of (config.members ?? [])) {
      const inbox = await this.loadInbox(teamDir, m.name).catch(() => [] as InboxMessage[])
      const isLead = m.agentId === config.leadAgentId
      const { status, lastActivityAt, lastSummary } = this.summariseInbox(inbox)
      members.push({
        agentId: m.agentId,
        name: m.name,
        agentType: m.agentType,
        model: m.model,
        cwd: m.cwd,
        tmuxPaneId: m.tmuxPaneId,
        backendType: m.backendType,
        joinedAt: m.joinedAt,
        color: m.color,
        status,
        lastActivityAt,
        lastSummary,
        messageCount: inbox.length,
        unreadCount: inbox.filter((x) => !x.read).length,
        isLead,
        task: m.task,
        worktreePath: m.worktreePath,
        branch: m.branch,
        state: m.state,
      })
    }
    return {
      id,
      name: config.name,
      description: config.description,
      goal: config.goal,
      workspaceId: config.workspaceId,
      workspacePath: config.workspacePath,
      worktreeStrategy: config.worktreeStrategy,
      mergeStrategy: config.mergeStrategy,
      createdAt: config.createdAt,
      leadAgentId: config.leadAgentId,
      leadSessionId: config.leadSessionId,
      members,
      status: config.status,
      // Codex 적대 검수 (medium #6) fix: config.council 이 watcher Team
      // 으로 안 옮겨져서 renderer 가 항상 council=false 로 받음 → council
      // 팀 만들어도 토론 탭 안 뜸. 명시적 copy.
      council: config.council === true,
    }
  }

  private async loadInbox(teamDir: string, name: string): Promise<InboxMessage[]> {
    const inboxPath = path.join(teamDir, 'inboxes', `${name}.json`)
    const data = JSON.parse(await fs.readFile(inboxPath, 'utf-8'))
    return Array.isArray(data) ? (data as InboxMessage[]) : []
  }

  private summariseInbox(inbox: InboxMessage[]): {
    status: AgentStatus
    lastActivityAt: string | null
    lastSummary: string | null
  } {
    if (inbox.length === 0) {
      return { status: 'running', lastActivityAt: null, lastSummary: null }
    }
    let status: AgentStatus = 'running'
    let lastSummary: string | null = null
    // Walk newest → oldest looking for the most recent state-bearing event,
    // and fish out the first non-control summary for display.
    for (let i = inbox.length - 1; i >= 0; i--) {
      const msg = inbox[i]
      try {
        const parsed = JSON.parse(msg.text)
        if (parsed.type === 'shutdown_request') {
          if (status === 'running') status = 'shutdown'
          continue
        }
        if (parsed.type === 'idle_notification') {
          if (status === 'running') status = 'idle'
          continue
        }
      } catch {
        // Plain text — fall through.
      }
      if (!lastSummary) {
        lastSummary = msg.summary ?? msg.text.slice(0, 120)
      }
    }
    const lastActivityAt = inbox[inbox.length - 1].timestamp
    return { status, lastActivityAt, lastSummary }
  }

  list(): Team[] {
    return Array.from(this.cache.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Return the on-disk config.json path for a team, or null if the team is
   * unknown or the watcher has no active workspace. Used by main.ts to
   * reconcile activity trackers against the live team list on boot/workspace
   * switch — the activity tracker tails this file for state changes.
   */
  configPathFor(teamId: string): string | null {
    if (!this.workspacePath) return null
    if (!this.cache.has(teamId)) return null
    return path.join(this.workspacePath, '.claude/teams', teamId, 'config.json')
  }

  /**
   * Create a new team. Provisions:
   *   1. config.json under <workspacePath>/.claude/teams/<teamId>/
   *   2. (isolated) per-member git worktrees + branches off `team/<teamId>`
   *   3. tmux session per member, optionally auto-launching `claude`
   *
   * Delegates the heavy lifting to TeamOperations, then nudges the cache so
   * the renderer sees the new team without waiting for the chokidar tick.
   */
  async create(opts: TeamCreateOptions): Promise<TeamCreateResult> {
    const result = await this.ops.create(opts)
    await this.refresh()
    this.emit('teams', this.list())
    return result
  }

  /**
   * Pause every member of a team. SIGSTOP is sent to the foreground process
   * group of each tmux pane so the underlying agent (claude / hooks /
   * children) actually halts. If signaling fails we fall back to detach-client
   * and emit `pause:degraded` so the UI can warn.
   */
  async pause(teamId: string): Promise<{ ok: boolean; degraded?: boolean }> {
    const result = await this.ops.pause(this.workspacePath, teamId)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    if (result.degraded) this.emit('pause:degraded', teamId)
    return result
  }

  async resume(teamId: string): Promise<{ ok: boolean; degraded?: boolean }> {
    const result = await this.ops.resume(this.workspacePath, teamId)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return result
  }

  async pauseMember(
    teamId: string,
    agentId: string
  ): Promise<{ ok: boolean; degraded?: boolean }> {
    const result = await this.ops.pauseMember(this.workspacePath, teamId, agentId)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return result
  }

  async resumeMember(
    teamId: string,
    agentId: string
  ): Promise<{ ok: boolean; degraded?: boolean }> {
    const result = await this.ops.resumeMember(this.workspacePath, teamId, agentId)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return result
  }

  /**
   * Merge each member branch into the team base branch (`team/<teamId>`).
   * Strategy:
   *   - 'squash':     `git merge --squash <branch>` per member, single commit.
   *   - 'sequential': `git merge --no-ff <branch>` per member, ordered.
   */
  async merge(teamId: string, opts: TeamMergeOptions = {}): Promise<TeamMergeResult> {
    return this.ops.merge(this.workspacePath, teamId, opts)
  }

  /** Member ↔ member 메시지: 상대 멤버의 inbox 에 entry append. */
  async sendInboxMessage(
    workspacePath: string | null,
    teamId: string,
    fromAgent: string,
    toAgent: string,
    text: string,
    summary?: string
  ): Promise<{ ok: boolean; error?: string }> {
    return this.ops.sendInboxMessage(workspacePath ?? this.workspacePath, teamId, fromAgent, toAgent, text, summary)
  }

  async readInbox(workspacePath: string | null, teamId: string, agentName: string) {
    return this.ops.readInbox(workspacePath ?? this.workspacePath, teamId, agentName)
  }

  async markInboxRead(workspacePath: string | null, teamId: string, agentName: string) {
    return this.ops.markInboxRead(workspacePath ?? this.workspacePath, teamId, agentName)
  }

  /** 멤버 worktree 사이의 같은 파일 수정 감지 — 머지 충돌 사전 경고. */
  async detectMemberConflicts(workspacePath: string | null, teamId: string) {
    return this.ops.detectMemberConflicts(workspacePath ?? this.workspacePath, teamId)
  }

  /**
   * Tear down a team:
   *   1. Kill each member tmux session.
   *   2. Remove each member git worktree (force).
   *   3. Delete `team/<teamId>` base branch.
   *   4. Remove the team config directory.
   */
  async remove(teamId: string): Promise<void> {
    await this.ops.remove(this.workspacePath, teamId)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
  }
}
