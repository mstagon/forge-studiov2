import * as chokidar from 'chokidar'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'
import { pathManager } from './PathManager'

const execFileAsync = promisify(execFile)

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

/** Strict tmux pane-id form (`%42`, `@7`, `$3`). Anything else is rejected. */
function isTmuxPaneId(value: string | undefined | null): value is string {
  return !!value && /^[%@$][A-Za-z0-9_-]+$/.test(value)
}

export type AgentStatus = 'running' | 'idle' | 'shutdown' | 'paused' | 'active'
export type TeamStatus = 'active' | 'paused'
export type WorktreeStrategy = 'isolated' | 'shared'
export type MergeStrategy = 'squash' | 'sequential'

export interface TeamCreateMember {
  agentId: string
  task?: string
}

export interface TeamCreateOptions {
  workspaceId: string
  workspacePath: string
  name: string
  goal?: string
  members: TeamCreateMember[]
  worktreeStrategy: WorktreeStrategy
  mergeStrategy: MergeStrategy
  /** Automatically `claude` boot inside each tmux session. Defaults to true. */
  autoStartClaude?: boolean
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
  worktreeStrategy?: WorktreeStrategy
  mergeStrategy?: MergeStrategy
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  members: TeamMember[]
  status?: TeamStatus
}

export interface TeamCreateResult {
  teamId: string
  configPath: string
  worktreesCreated: number
  tmuxSessionsStarted: number
}

export interface TeamMergeConflict {
  file: string
  theirsBranch: string
  oursBranch: string
  conflictMarkers: string
}

/**
 * Flat result envelope — chosen to match the renderer's `MergeResult` so the
 * IPC payload doesn't need bridging on the boundary. `ok: true` populates
 * `mergedBranch`/`commitSha`; `ok: false` populates `conflicts`/`error`.
 */
export interface TeamMergeResult {
  ok: boolean
  mergedBranch?: string
  commitSha?: string
  conflicts?: TeamMergeConflict[]
  error?: string
}

export interface TeamMergeOptions {
  mergeStrategy?: MergeStrategy
}

interface RawMember {
  agentId: string
  name: string
  agentType: string
  model: string
  cwd?: string
  tmuxPaneId?: string
  backendType?: string
  joinedAt: number
  color?: string
  prompt?: string
  task?: string
  worktreePath?: string
  branch?: string
  state?: 'active' | 'idle'
}

interface RawConfig {
  name: string
  description?: string
  goal?: string
  workspaceId?: string
  workspacePath?: string
  worktreeStrategy?: WorktreeStrategy
  mergeStrategy?: MergeStrategy
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  members: RawMember[]
  status?: TeamStatus
  /** Base branch carved out for the team — `team/<teamId>`. */
  baseBranch?: string
}

interface InboxMessage {
  from: string
  text: string
  summary?: string
  timestamp: string
  color?: string
  read?: boolean
}

/** Validate `child` is contained within `parent` to defend against path traversal. */
function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function teamSessionName(teamId: string, agentId: string): string {
  // tmux session names: alphanumerics, dashes, underscores. Sanitize agent ids.
  const safe = agentId.replace(/[^A-Za-z0-9_-]/g, '_')
  return `forge-team-${teamId}-${safe}`
}

export class AgentTeamWatcher extends EventEmitter {
  /**
   * Active teams root. Defaults to ~/.claude/teams for legacy installs but is
   * normally pointed at <activeWorkspacePath>/.claude/teams via setWorkspace()
   * so each workspace has its own scoped team registry.
   */
  private teamsDir = path.join(os.homedir(), '.claude', 'teams')
  private watcher: chokidar.FSWatcher | null = null
  private cache: Map<string, Team> = new Map()
  private refreshTimer: NodeJS.Timeout | null = null

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
    if (this.watcher) {
      await this.watcher.close().catch(() => {})
      this.watcher = null
    }
    this.cache = new Map()
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
      worktreeStrategy: config.worktreeStrategy,
      mergeStrategy: config.mergeStrategy,
      createdAt: config.createdAt,
      leadAgentId: config.leadAgentId,
      leadSessionId: config.leadSessionId,
      members,
      status: config.status,
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

  // ── External tool gating ─────────────────────────────────────────────

  /** Return true when `git` resolves on PATH and is invokable. */
  private async hasGit(): Promise<boolean> {
    try {
      await execFileAsync('git', ['--version'], { timeout: 3000, env: tmuxEnv() })
      return true
    } catch {
      return false
    }
  }

  /**
   * Return true when `tmux` resolves — checking the bundled binary first so
   * Dock-launched apps (which inherit a sparse PATH) still find the bundled
   * tmux even when the system PATH lacks /opt/homebrew/bin.
   */
  private async hasTmux(): Promise<boolean> {
    try {
      await execFileAsync(tmuxBin(), ['-V'], { timeout: 3000, env: tmuxEnv() })
      return true
    } catch {
      return false
    }
  }

  private async resolveBaseBranch(workspacePath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', workspacePath, 'branch', '--show-current'], {
        timeout: 5000,
        env: tmuxEnv(),
      })
      const cur = stdout.trim()
      if (cur) return cur
    } catch {
      // fall through
    }
    return 'main'
  }

  /** Best-effort `git branch <newBranch> <fromBranch>` — silent on failure. */
  private async ensureBranch(workspacePath: string, newBranch: string, fromBranch: string): Promise<boolean> {
    try {
      // If branch already exists, just succeed.
      await execFileAsync('git', ['-C', workspacePath, 'rev-parse', '--verify', newBranch], {
        timeout: 4000,
        env: tmuxEnv(),
      })
      return true
    } catch {
      // doesn't exist yet, create
    }
    try {
      await execFileAsync('git', ['-C', workspacePath, 'branch', newBranch, fromBranch], {
        timeout: 8000,
        env: tmuxEnv(),
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Create a new team. Provisions:
   *   1. config.json under <workspacePath>/.claude/teams/<teamId>/
   *   2. (isolated) per-member git worktrees + branches off `team/<teamId>`
   *   3. tmux session per member, optionally auto-launching `claude`
   *
   * All side effects are best-effort — missing git/tmux yields graceful
   * degradation: config is still written so the team appears in the registry,
   * just without worktree/tmux fields populated.
   */
  async create(opts: TeamCreateOptions): Promise<TeamCreateResult> {
    if (!opts.workspacePath) throw new Error('workspacePath is required')
    if (!opts.name?.trim()) throw new Error('team name is required')
    if (!Array.isArray(opts.members) || opts.members.length === 0) {
      throw new Error('at least one member is required')
    }

    const teamId = `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const teamRoot = path.join(opts.workspacePath, '.claude', 'teams', teamId)
    await fs.mkdir(teamRoot, { recursive: true })

    const now = Date.now()
    const leadAgentId = opts.members[0].agentId
    const wsPath = opts.workspacePath
    const gitOk = await this.hasGit()
    const tmuxOk = await this.hasTmux()

    let baseBranch: string | undefined
    let teamBaseBranch: string | undefined
    if (gitOk && opts.worktreeStrategy === 'isolated') {
      baseBranch = await this.resolveBaseBranch(wsPath)
      teamBaseBranch = `team/${teamId}`
      // Carve out a stable base for member worktrees to branch from.
      await this.ensureBranch(wsPath, teamBaseBranch, baseBranch)
    } else if (gitOk) {
      baseBranch = await this.resolveBaseBranch(wsPath)
    }

    let worktreesCreated = 0
    let tmuxSessionsStarted = 0
    const autoStart = opts.autoStartClaude !== false

    const rawMembers: RawMember[] = []
    for (let idx = 0; idx < opts.members.length; idx++) {
      const m = opts.members[idx]
      const safeAgentId = m.agentId.replace(/[^A-Za-z0-9_-]/g, '_')
      const member: RawMember = {
        agentId: m.agentId,
        // Member `name` doubles as the inbox filename — keep it filesystem-safe
        // and unique within the team.
        name: m.agentId,
        agentType: m.agentId,
        model: 'sonnet-4.5',
        joinedAt: now + idx,
        task: m.task,
        state: 'active',
      }

      // ── Worktree provisioning ──────────────────────────────────────
      let memberCwd: string | null = null
      if (opts.worktreeStrategy === 'isolated' && gitOk && teamBaseBranch) {
        const worktreePath = path.join(teamRoot, 'worktrees', safeAgentId)
        // Defense in depth: ensure path is contained in teamRoot which itself
        // is under wsPath (constructed from workspacePath above).
        if (!isPathInside(teamRoot, worktreePath)) {
          // Skip silently — can't safely create. Member ends up shared-style.
          member.worktreePath = wsPath
          member.branch = baseBranch
          memberCwd = wsPath
        } else {
          const memberBranch = `team/${teamId}/${safeAgentId}`
          try {
            await fs.mkdir(path.dirname(worktreePath), { recursive: true })
            await execFileAsync(
              'git',
              ['-C', wsPath, 'worktree', 'add', '-b', memberBranch, worktreePath, teamBaseBranch],
              { timeout: 30_000, env: tmuxEnv() }
            )
            member.worktreePath = worktreePath
            member.branch = memberBranch
            memberCwd = worktreePath
            worktreesCreated++
          } catch {
            // Graceful — leave fields empty, fall back to wsPath for tmux cwd.
            memberCwd = wsPath
          }
        }
      } else {
        // Shared strategy or no git: every member operates on the workspace.
        member.worktreePath = wsPath
        member.branch = baseBranch
        memberCwd = wsPath
      }

      // ── tmux session ───────────────────────────────────────────────
      if (tmuxOk && memberCwd) {
        const session = teamSessionName(teamId, m.agentId)
        const tmux = tmuxBin()
        const env = tmuxEnv()
        try {
          await execFileAsync(
            tmux,
            ['new-session', '-d', '-s', session, '-c', memberCwd],
            { timeout: 8000, env }
          )
          // Capture the real pane id (`%N`) of the freshly-created session so
          // PtyManager.createTmuxAttach (which strictly validates the
          // `%`/`@`/`$` form) can attach. The legacy `session:0.0` form was
          // rejected as "Invalid tmux target", leaving the live terminal grid
          // unable to mount any pane.
          let realPaneId: string | null = null
          try {
            const { stdout } = await execFileAsync(
              tmux,
              ['display-message', '-p', '-t', session, '#{pane_id}'],
              { timeout: 3000, env }
            )
            const candidate = stdout.trim()
            if (isTmuxPaneId(candidate)) realPaneId = candidate
          } catch {
            // pane lookup failed — fall through; member ends up without a
            // valid tmuxPaneId so the UI shows a degraded state instead of a
            // bogus "session:0.0" target.
          }
          if (autoStart) {
            try {
              await execFileAsync(tmux, ['send-keys', '-t', session, 'claude', 'Enter'], {
                timeout: 4000,
                env,
              })
            } catch {
              // ignore — session exists, claude just didn't auto-fire.
            }
          }
          if (realPaneId) {
            member.tmuxPaneId = realPaneId
            member.backendType = 'tmux'
            member.cwd = memberCwd
            tmuxSessionsStarted++
          } else {
            // Session exists but we couldn't resolve a valid pane id. Keep
            // the cwd so the UI can show the member, but omit tmuxPaneId so
            // the renderer falls back to a non-tmux terminal instead of
            // crashing on attach.
            member.cwd = memberCwd
          }
        } catch {
          // tmux unavailable / collision — leave tmuxPaneId unset.
        }
      } else if (memberCwd) {
        member.cwd = memberCwd
      }

      rawMembers.push(member)
    }

    const config: RawConfig = {
      name: opts.name,
      goal: opts.goal,
      workspaceId: opts.workspaceId,
      workspacePath: wsPath,
      worktreeStrategy: opts.worktreeStrategy,
      mergeStrategy: opts.mergeStrategy,
      createdAt: now,
      leadAgentId,
      members: rawMembers,
      status: 'active',
      baseBranch: teamBaseBranch,
    }
    const configPath = path.join(teamRoot, 'config.json')
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // chokidar is debounced; nudge the cache immediately so the renderer can
    // see the new team without waiting for the next refresh tick.
    await this.refresh()
    this.emit('teams', this.list())
    return { teamId, configPath, worktreesCreated, tmuxSessionsStarted }
  }

  // ── Pause / Resume ───────────────────────────────────────────────────

  /** Read+write the raw on-disk config for `teamId`. */
  private async readConfig(teamId: string): Promise<{ configPath: string; config: RawConfig } | null> {
    const teamDir = path.join(this.teamsDir, teamId)
    const configPath = path.join(teamDir, 'config.json')
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8')) as RawConfig
      return { configPath, config }
    } catch {
      return null
    }
  }

  private async writeConfig(configPath: string, config: RawConfig): Promise<void> {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * Resolve the pane's foreground PID via `tmux display-message -p
   * '#{pane_pid}'`. The pane_pid is the *direct child* of tmux (typically the
   * shell), so SIGSTOP/SIGCONT on it pauses the shell and any descendants
   * (claude, child agents) by virtue of process-group inheritance on most
   * shells. Returns null when tmux can't be queried or the pid is unparsable.
   */
  private async resolvePanePid(paneId: string): Promise<number | null> {
    if (!isTmuxPaneId(paneId)) return null
    try {
      const { stdout } = await execFileAsync(
        tmuxBin(),
        ['display-message', '-p', '-t', paneId, '#{pane_pid}'],
        { timeout: 3000, env: tmuxEnv() }
      )
      const pid = parseInt(stdout.trim(), 10)
      return Number.isFinite(pid) && pid > 0 ? pid : null
    } catch {
      return null
    }
  }

  /**
   * Stop or continue the foreground process tree of a tmux pane. We send the
   * signal to the pane's process group (`-PID`) so children (claude →
   * sub-agents) get the signal too. Returns true when the signal landed.
   *
   * Falls back to no-op on platforms that don't support POSIX kill (Windows)
   * — caller should treat false as "couldn't truly suspend, fell back to
   * detach" and surface the degraded state to the user.
   */
  private signalPaneTree(pid: number, signal: 'SIGSTOP' | 'SIGCONT'): boolean {
    try {
      // Negative PID = process group. The shell tmux spawns is normally a
      // session leader so this hits its descendants too. If group signaling
      // fails (e.g. the pane child isn't a group leader), fall back to PID.
      try {
        process.kill(-pid, signal)
        return true
      } catch {
        process.kill(pid, signal)
        return true
      }
    } catch {
      return false
    }
  }

  /**
   * Pause every member of a team. We send SIGSTOP to the foreground process
   * group of each member's pane so the underlying agent (claude / hooks /
   * children) actually halts — preventing further file edits and token spend.
   * If pane PID resolution or signaling fails, we fall back to detach-client
   * (cosmetic only) and emit a `pause:degraded` event so the UI can warn.
   */
  async pause(teamId: string): Promise<{ ok: boolean; degraded?: boolean }> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false }
    const tmuxOk = await this.hasTmux()
    found.config.status = 'paused'
    let degraded = false
    for (const m of found.config.members) {
      m.state = 'idle'
      if (!tmuxOk || !isTmuxPaneId(m.tmuxPaneId)) {
        degraded = true
        continue
      }
      const pid = await this.resolvePanePid(m.tmuxPaneId)
      const stopped = pid != null && this.signalPaneTree(pid, 'SIGSTOP')
      if (!stopped) {
        // Fallback: detach the client so the user no longer sees it; warn the
        // caller that the agent process is still running.
        const session = teamSessionName(teamId, m.agentId)
        await execFileAsync(tmuxBin(), ['detach-client', '-s', session], {
          timeout: 3000,
          env: tmuxEnv(),
        }).catch(() => {})
        degraded = true
      }
    }
    await this.writeConfig(found.configPath, found.config)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    if (degraded) this.emit('pause:degraded', teamId)
    return { ok: true, degraded }
  }

  async resume(teamId: string): Promise<{ ok: boolean; degraded?: boolean }> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false }
    const tmuxOk = await this.hasTmux()
    found.config.status = 'active'
    let degraded = false
    for (const m of found.config.members) {
      m.state = 'active'
      if (!tmuxOk || !isTmuxPaneId(m.tmuxPaneId)) continue
      const pid = await this.resolvePanePid(m.tmuxPaneId)
      const cont = pid != null && this.signalPaneTree(pid, 'SIGCONT')
      if (!cont) degraded = true
    }
    await this.writeConfig(found.configPath, found.config)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return { ok: true, degraded }
  }

  async pauseMember(teamId: string, agentId: string): Promise<{ ok: boolean; degraded?: boolean }> {
    if (!teamId || !agentId) throw new Error('teamId and agentId are required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false }
    const member = found.config.members.find((m) => m.agentId === agentId)
    if (!member) return { ok: false }
    member.state = 'idle'
    let degraded = false
    const tmuxOk = await this.hasTmux()
    if (tmuxOk && isTmuxPaneId(member.tmuxPaneId)) {
      const pid = await this.resolvePanePid(member.tmuxPaneId)
      const stopped = pid != null && this.signalPaneTree(pid, 'SIGSTOP')
      if (!stopped) {
        const session = teamSessionName(teamId, agentId)
        await execFileAsync(tmuxBin(), ['detach-client', '-s', session], {
          timeout: 3000,
          env: tmuxEnv(),
        }).catch(() => {})
        degraded = true
      }
    } else {
      degraded = true
    }
    await this.writeConfig(found.configPath, found.config)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return { ok: true, degraded }
  }

  async resumeMember(teamId: string, agentId: string): Promise<{ ok: boolean; degraded?: boolean }> {
    if (!teamId || !agentId) throw new Error('teamId and agentId are required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false }
    const member = found.config.members.find((m) => m.agentId === agentId)
    if (!member) return { ok: false }
    member.state = 'active'
    let degraded = false
    const tmuxOk = await this.hasTmux()
    if (tmuxOk && isTmuxPaneId(member.tmuxPaneId)) {
      const pid = await this.resolvePanePid(member.tmuxPaneId)
      const cont = pid != null && this.signalPaneTree(pid, 'SIGCONT')
      if (!cont) degraded = true
    }
    await this.writeConfig(found.configPath, found.config)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return { ok: true, degraded }
  }

  // ── Merge ────────────────────────────────────────────────────────────

  /**
   * Merge each member branch into the team base branch (`team/<teamId>`).
   * Strategy:
   *   - 'squash':     `git merge --squash <branch>` per member, single commit.
   *   - 'sequential': `git merge --no-ff <branch>` per member, ordered.
   *
   * On first conflict: aborts the in-flight merge, scrapes conflicted files,
   * and returns conflict descriptors. Already-merged members are kept.
   */
  async merge(teamId: string, opts: TeamMergeOptions = {}): Promise<TeamMergeResult> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false, conflicts: [], error: 'team not found' }
    const cfg = found.config
    const wsPath = cfg.workspacePath
    if (!wsPath) {
      return { ok: false, conflicts: [], error: 'workspacePath missing on team' }
    }
    if (!(await this.hasGit())) {
      return { ok: false, conflicts: [], error: 'git not available' }
    }

    const baseBranch = cfg.baseBranch ?? `team/${teamId}`
    const strategy: MergeStrategy = opts.mergeStrategy ?? cfg.mergeStrategy ?? 'squash'
    const env = tmuxEnv()

    // Refuse to merge into a dirty workspace — otherwise we'd silently fold
    // the user's WIP into the team merge commit.
    const dirty = await this.workspaceDirty(wsPath)
    if (dirty) {
      return {
        ok: false,
        conflicts: [],
        error: 'workspace has uncommitted changes; commit or stash before merging the team',
      }
    }

    // Move HEAD to baseBranch in the workspace so merges land there.
    try {
      await execFileAsync('git', ['-C', wsPath, 'checkout', baseBranch], { timeout: 10_000, env })
    } catch (err) {
      return {
        ok: false,
        conflicts: [],
        error: `failed to checkout ${baseBranch}: ${(err as Error).message}`,
      } satisfies TeamMergeResult
    }

    const memberBranches = cfg.members.map((m) => m.branch).filter((b): b is string => !!b && b !== baseBranch)

    for (const branch of memberBranches) {
      const args = strategy === 'squash'
        ? ['-C', wsPath, 'merge', '--squash', branch]
        : ['-C', wsPath, 'merge', '--no-ff', '--no-edit', branch]
      try {
        await execFileAsync('git', args, { timeout: 30_000, env })
      } catch (err) {
        // Inspect conflict state, abort, return descriptors.
        const conflicts = await this.collectConflicts(wsPath, branch, baseBranch)
        await execFileAsync('git', ['-C', wsPath, 'merge', '--abort'], {
          timeout: 5000,
          env,
        }).catch(() => {})
        return {
          ok: false,
          conflicts,
          error: (err as Error).message,
        }
      }

      if (strategy === 'squash') {
        // --squash leaves changes staged; commit them before the next member.
        // Failure here (missing identity, hook rejection, etc.) MUST abort —
        // swallowing it leaves the workspace with staged-but-uncommitted
        // changes while we report success, which is the H3 bug.
        try {
          await execFileAsync(
            'git',
            ['-C', wsPath, 'commit', '-m', `team(${teamId}): squash merge ${branch}`],
            { timeout: 10_000, env }
          )
        } catch (err) {
          const stderr = ((err as { stderr?: Buffer | string }).stderr ?? '').toString().trim()
          // Reset the staged squash so we don't leave the index dirty for the
          // user to clean up by hand. `git reset --merge` is the documented
          // way to undo a squash that hasn't been committed.
          await execFileAsync('git', ['-C', wsPath, 'reset', '--merge'], {
            timeout: 5000,
            env,
          }).catch(() => {})
          return {
            ok: false,
            conflicts: [],
            error: `squash commit failed for ${branch}: ${stderr || (err as Error).message}`,
          }
        }
      }

      // After every merged branch, verify the workspace is clean. If it's
      // not, something committed partial state (e.g. pre-commit hook silently
      // unstaged files) and we should bail rather than continue stacking
      // members on top of an inconsistent base.
      const stillDirty = await this.workspaceDirty(wsPath)
      if (stillDirty) {
        return {
          ok: false,
          conflicts: [],
          error: `workspace not clean after merging ${branch}; aborting`,
        }
      }
    }

    // Resolve final commit sha on the base branch.
    let commitSha: string | undefined
    try {
      const { stdout } = await execFileAsync('git', ['-C', wsPath, 'rev-parse', 'HEAD'], {
        timeout: 4000,
        env,
      })
      commitSha = stdout.trim() || undefined
    } catch {
      // ignore
    }

    const result: TeamMergeResult = { ok: true, mergedBranch: baseBranch }
    if (commitSha) result.commitSha = commitSha
    return result
  }

  /**
   * `git status --porcelain` returns one line per untracked/modified path.
   * Empty stdout = clean tree. Used to gate merge entry/exit so we never
   * report success while the index has staged-but-uncommitted changes.
   *
   * Forge-owned runtime paths (`.claude/teams/**`, worktree directories the
   * watcher itself creates) are filtered out — otherwise the merge gate would
   * deterministically fail in workspaces where `.claude` is tracked, because
   * `create()` itself dirties the same tree that `merge()` requires clean.
   */
  private async workspaceDirty(wsPath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', wsPath, 'status', '--porcelain'],
        { timeout: 5000, env: tmuxEnv() }
      )
      const lines = stdout.split('\n').map((l) => l.trimEnd()).filter(Boolean)
      const userDirty = lines.filter((line) => {
        // Porcelain v1 format: XY<space>path  (renames have ` -> ` separator)
        const rest = line.slice(3)
        const arrow = rest.indexOf(' -> ')
        const filePath = (arrow >= 0 ? rest.slice(arrow + 4) : rest).replace(/^"(.*)"$/, '$1')
        return !this.isForgeOwnedPath(filePath)
      })
      return userDirty.length > 0
    } catch {
      // If status itself fails we can't trust the tree — treat as dirty.
      return true
    }
  }

  /** Paths the watcher itself writes inside a workspace. */
  private isForgeOwnedPath(rel: string): boolean {
    const normalized = rel.replace(/\\/g, '/')
    return (
      normalized === '.claude/teams' ||
      normalized.startsWith('.claude/teams/') ||
      normalized === '.claude/worktrees' ||
      normalized.startsWith('.claude/worktrees/')
    )
  }

  private async collectConflicts(
    wsPath: string,
    theirsBranch: string,
    oursBranch: string
  ): Promise<TeamMergeConflict[]> {
    let files: string[] = []
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', wsPath, 'diff', '--name-only', '--diff-filter=U'],
        { timeout: 5000, env: tmuxEnv() }
      )
      files = stdout.split('\n').map((s) => s.trim()).filter(Boolean)
    } catch {
      // ignore
    }
    const out: TeamMergeConflict[] = []
    for (const file of files) {
      let conflictMarkers = ''
      try {
        const buf = await fs.readFile(path.join(wsPath, file), 'utf-8')
        // Extract just the first conflict block (≤ ~40 lines) for preview.
        const start = buf.indexOf('<<<<<<<')
        const end = buf.indexOf('>>>>>>>', start)
        if (start >= 0 && end > start) {
          conflictMarkers = buf.slice(start, end + 80).split('\n').slice(0, 60).join('\n')
        }
      } catch {
        // unreadable — leave empty
      }
      out.push({ file, theirsBranch, oursBranch, conflictMarkers })
    }
    return out
  }

  // ── Remove ───────────────────────────────────────────────────────────

  /**
   * Tear down a team:
   *   1. Kill each member tmux session.
   *   2. Remove each member git worktree (force).
   *   3. Delete `team/<teamId>` base branch.
   *   4. Remove the team config directory.
   * Each step is independently best-effort.
   */
  async remove(teamId: string): Promise<void> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(teamId)
    const tmuxOk = await this.hasTmux()
    const gitOk = await this.hasGit()

    if (found) {
      const cfg = found.config
      const wsPath = cfg.workspacePath
      const env = tmuxEnv()

      // Kill tmux sessions (per member). Use the bundled tmux when available
      // so this works in Dock-launched apps without /opt/homebrew on PATH.
      if (tmuxOk) {
        const tmux = tmuxBin()
        for (const m of cfg.members) {
          const session = teamSessionName(teamId, m.agentId)
          await execFileAsync(tmux, ['kill-session', '-t', session], {
            timeout: 3000,
            env,
          }).catch(() => {})
        }
      }

      // Remove worktrees (only if isolated and within wsPath).
      if (gitOk && wsPath) {
        for (const m of cfg.members) {
          if (!m.worktreePath || m.worktreePath === wsPath) continue
          if (!isPathInside(wsPath, m.worktreePath)) continue
          await execFileAsync(
            'git',
            ['-C', wsPath, 'worktree', 'remove', m.worktreePath, '--force'],
            { timeout: 15_000, env }
          ).catch(() => {})
        }
        // Delete member branches.
        for (const m of cfg.members) {
          if (!m.branch || !m.branch.startsWith(`team/${teamId}`)) continue
          if (m.branch === cfg.baseBranch) continue
          await execFileAsync('git', ['-C', wsPath, 'branch', '-D', m.branch], {
            timeout: 5000,
            env,
          }).catch(() => {})
        }
        // Delete team base branch.
        const teamBase = cfg.baseBranch ?? `team/${teamId}`
        await execFileAsync('git', ['-C', wsPath, 'branch', '-D', teamBase], {
          timeout: 5000,
          env,
        }).catch(() => {})
      }
    }

    // Finally, drop the config directory.
    const target = path.join(this.teamsDir, teamId)
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
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
