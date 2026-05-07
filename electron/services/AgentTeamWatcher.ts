import * as chokidar from 'chokidar'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'

const execFileAsync = promisify(execFile)

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

  // ── External tool gating ─────────────────────────────────────────────

  /** Return true when `git` resolves on PATH and is invokable. */
  private async hasGit(): Promise<boolean> {
    try {
      await execFileAsync('git', ['--version'], { timeout: 3000 })
      return true
    } catch {
      return false
    }
  }

  /** Return true when `tmux` resolves on PATH. */
  private async hasTmux(): Promise<boolean> {
    try {
      await execFileAsync('tmux', ['-V'], { timeout: 3000 })
      return true
    } catch {
      return false
    }
  }

  private async resolveBaseBranch(workspacePath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', workspacePath, 'branch', '--show-current'], {
        timeout: 5000,
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
      await execFileAsync('git', ['-C', workspacePath, 'rev-parse', '--verify', newBranch], { timeout: 4000 })
      return true
    } catch {
      // doesn't exist yet, create
    }
    try {
      await execFileAsync('git', ['-C', workspacePath, 'branch', newBranch, fromBranch], { timeout: 8000 })
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
              { timeout: 30_000 }
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
        try {
          await execFileAsync(
            'tmux',
            ['new-session', '-d', '-s', session, '-c', memberCwd],
            { timeout: 8000 }
          )
          if (autoStart) {
            try {
              await execFileAsync('tmux', ['send-keys', '-t', session, 'claude', 'Enter'], {
                timeout: 4000,
              })
            } catch {
              // ignore — session exists, claude just didn't auto-fire.
            }
          }
          // We don't have the actual %N pane id, so use session:window.pane
          // form which createTmuxAttach won't accept. Provide the session name
          // only; UI may fall back to `tmux attach -t <session>` for now.
          member.tmuxPaneId = `${session}:0.0`
          member.backendType = 'tmux'
          member.cwd = memberCwd
          tmuxSessionsStarted++
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
   * Pause every member of a team. tmux sessions are sent Ctrl-Z (SIGTSTP via
   * suspend-client equivalent isn't safe here — we just flag config, since
   * killing would lose context). Renderer can re-attach after resume.
   */
  async pause(teamId: string): Promise<{ ok: boolean }> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false }
    const tmuxOk = await this.hasTmux()
    found.config.status = 'paused'
    for (const m of found.config.members) {
      m.state = 'idle'
      if (tmuxOk && m.tmuxPaneId) {
        const session = teamSessionName(teamId, m.agentId)
        // detach-client: drops any attached client without killing the session
        // so claude keeps running but the user no longer sees it.
        await execFileAsync('tmux', ['detach-client', '-s', session], { timeout: 3000 }).catch(() => {})
      }
    }
    await this.writeConfig(found.configPath, found.config)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return { ok: true }
  }

  async resume(teamId: string): Promise<{ ok: boolean }> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false }
    found.config.status = 'active'
    for (const m of found.config.members) {
      m.state = 'active'
    }
    await this.writeConfig(found.configPath, found.config)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return { ok: true }
  }

  async pauseMember(teamId: string, agentId: string): Promise<{ ok: boolean }> {
    if (!teamId || !agentId) throw new Error('teamId and agentId are required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false }
    const member = found.config.members.find((m) => m.agentId === agentId)
    if (!member) return { ok: false }
    member.state = 'idle'
    const tmuxOk = await this.hasTmux()
    if (tmuxOk && member.tmuxPaneId) {
      const session = teamSessionName(teamId, agentId)
      await execFileAsync('tmux', ['detach-client', '-s', session], { timeout: 3000 }).catch(() => {})
    }
    await this.writeConfig(found.configPath, found.config)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return { ok: true }
  }

  async resumeMember(teamId: string, agentId: string): Promise<{ ok: boolean }> {
    if (!teamId || !agentId) throw new Error('teamId and agentId are required')
    const found = await this.readConfig(teamId)
    if (!found) return { ok: false }
    const member = found.config.members.find((m) => m.agentId === agentId)
    if (!member) return { ok: false }
    member.state = 'active'
    await this.writeConfig(found.configPath, found.config)
    await this.refresh()
    this.emit('teams', this.list())
    this.emit('change', teamId)
    return { ok: true }
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

    // Move HEAD to baseBranch in the workspace so merges land there.
    try {
      await execFileAsync('git', ['-C', wsPath, 'checkout', baseBranch], { timeout: 10_000 })
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
        await execFileAsync('git', args, { timeout: 30_000 })
        if (strategy === 'squash') {
          // --squash leaves changes staged; commit them before next member.
          await execFileAsync(
            'git',
            ['-C', wsPath, 'commit', '-m', `team(${teamId}): squash merge ${branch}`],
            { timeout: 10_000 }
          ).catch(() => {})
        }
      } catch (err) {
        // Inspect conflict state, abort, return descriptors.
        const conflicts = await this.collectConflicts(wsPath, branch, baseBranch)
        await execFileAsync('git', ['-C', wsPath, 'merge', '--abort'], { timeout: 5000 }).catch(() => {})
        return {
          ok: false,
          conflicts,
          error: (err as Error).message,
        }
      }
    }

    // Resolve final commit sha on the base branch.
    let commitSha: string | undefined
    try {
      const { stdout } = await execFileAsync('git', ['-C', wsPath, 'rev-parse', 'HEAD'], { timeout: 4000 })
      commitSha = stdout.trim() || undefined
    } catch {
      // ignore
    }

    const result: TeamMergeResult = { ok: true, mergedBranch: baseBranch }
    if (commitSha) result.commitSha = commitSha
    return result
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
        { timeout: 5000 }
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

      // Kill tmux sessions (per member).
      if (tmuxOk) {
        for (const m of cfg.members) {
          const session = teamSessionName(teamId, m.agentId)
          await execFileAsync('tmux', ['kill-session', '-t', session], { timeout: 3000 }).catch(() => {})
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
            { timeout: 15_000 }
          ).catch(() => {})
        }
        // Delete member branches.
        for (const m of cfg.members) {
          if (!m.branch || !m.branch.startsWith(`team/${teamId}`)) continue
          if (m.branch === cfg.baseBranch) continue
          await execFileAsync('git', ['-C', wsPath, 'branch', '-D', m.branch], { timeout: 5000 }).catch(
            () => {}
          )
        }
        // Delete team base branch.
        const teamBase = cfg.baseBranch ?? `team/${teamId}`
        await execFileAsync('git', ['-C', wsPath, 'branch', '-D', teamBase], { timeout: 5000 }).catch(
          () => {}
        )
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
