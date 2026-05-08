import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * TeamOperations — pure, watcher-free, electron-free implementation of the
 * team lifecycle (create / pause / resume / merge / remove).
 *
 * Why split this out of AgentTeamWatcher:
 *   - The Electron GUI uses chokidar to discover teams and reacts to file
 *     changes; the headless CLI (`bin/forge-team`) does not.
 *   - The CLI must run without `electron` or `chokidar` imported at load
 *     time, so the I/O-bearing logic that both consumers share lives here.
 *   - The Watcher delegates state-mutating calls into this module and
 *     re-emits change events afterward.
 *
 * The class accepts `tmuxBin` / `tmuxEnv` as factories so callers can plug
 * in their own resolution (PathManager-backed in Electron, plain `tmux` on
 * PATH from the CLI).
 */

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
  autoStartClaude?: boolean
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

export interface RawMember {
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

export interface RawConfig {
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
  baseBranch?: string
}

export interface TeamSummary {
  id: string
  name: string
  goal?: string
  workspaceId?: string
  worktreeStrategy?: WorktreeStrategy
  mergeStrategy?: MergeStrategy
  status?: TeamStatus
  createdAt: number
  leadAgentId: string
  members: Array<{
    agentId: string
    name: string
    branch?: string
    worktreePath?: string
    tmuxPaneId?: string
    state?: 'active' | 'idle'
    task?: string
  }>
}

export interface TeamOperationsDeps {
  /** Resolve the tmux binary to invoke. Falls back to PATH `tmux`. */
  tmuxBin: () => string
  /** Build an env that exposes any bundled bin/ directories on PATH. */
  tmuxEnv: () => NodeJS.ProcessEnv
  /**
   * Resolve the teams root directory for a workspace. Defaults to
   * `<workspacePath>/.claude/teams`; the Electron watcher overrides this so
   * a null workspace falls back to `~/.claude/teams`.
   */
  teamsDirFor?: (workspacePath: string | null) => string
}

/** Strict tmux pane-id form (`%42`, `@7`, `$3`). Anything else is rejected. */
export function isTmuxPaneId(value: string | undefined | null): value is string {
  return !!value && /^[%@$][A-Za-z0-9_-]+$/.test(value)
}

/** Validate `child` is contained within `parent` to defend against path traversal. */
export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export function teamSessionName(teamId: string, agentId: string): string {
  const safe = agentId.replace(/[^A-Za-z0-9_-]/g, '_')
  return `forge-team-${teamId}-${safe}`
}

function defaultTeamsDirFor(workspacePath: string | null): string {
  return workspacePath
    ? path.join(workspacePath, '.claude', 'teams')
    : path.join(os.homedir(), '.claude', 'teams')
}

export class TeamOperations {
  private readonly tmuxBin: () => string
  private readonly tmuxEnv: () => NodeJS.ProcessEnv
  private readonly teamsDirFor: (workspacePath: string | null) => string

  constructor(deps: TeamOperationsDeps) {
    this.tmuxBin = deps.tmuxBin
    this.tmuxEnv = deps.tmuxEnv
    this.teamsDirFor = deps.teamsDirFor ?? defaultTeamsDirFor
  }

  // ── External tool gating ─────────────────────────────────────────────

  async hasGit(): Promise<boolean> {
    try {
      await execFileAsync('git', ['--version'], { timeout: 3000, env: this.tmuxEnv() })
      return true
    } catch {
      return false
    }
  }

  async hasTmux(): Promise<boolean> {
    try {
      await execFileAsync(this.tmuxBin(), ['-V'], { timeout: 3000, env: this.tmuxEnv() })
      return true
    } catch {
      return false
    }
  }

  private async resolveBaseBranch(workspacePath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', workspacePath, 'branch', '--show-current'],
        { timeout: 5000, env: this.tmuxEnv() }
      )
      const cur = stdout.trim()
      if (cur) return cur
    } catch {
      // fall through
    }
    return 'main'
  }

  private async ensureBranch(
    workspacePath: string,
    newBranch: string,
    fromBranch: string
  ): Promise<boolean> {
    try {
      await execFileAsync(
        'git',
        ['-C', workspacePath, 'rev-parse', '--verify', newBranch],
        { timeout: 4000, env: this.tmuxEnv() }
      )
      return true
    } catch {
      // doesn't exist yet
    }
    try {
      await execFileAsync(
        'git',
        ['-C', workspacePath, 'branch', newBranch, fromBranch],
        { timeout: 8000, env: this.tmuxEnv() }
      )
      return true
    } catch {
      return false
    }
  }

  // ── Listing ──────────────────────────────────────────────────────────

  /**
   * Enumerate teams under `<workspacePath>/.claude/teams`. Returns a flat,
   * JSON-friendly summary (no inbox parsing — that lives in the watcher).
   * Callers that need the richer Team shape (status from inbox, unread
   * counts, etc.) should use the watcher's `list()` instead.
   */
  async list(workspacePath: string | null): Promise<TeamSummary[]> {
    const teamsDir = this.teamsDirFor(workspacePath)
    let dirs: string[] = []
    try {
      dirs = await fs.readdir(teamsDir)
    } catch {
      return []
    }
    const out: TeamSummary[] = []
    for (const id of dirs) {
      const found = await this.readConfig(workspacePath, id)
      if (!found) continue
      const cfg = found.config
      out.push({
        id,
        name: cfg.name,
        goal: cfg.goal,
        workspaceId: cfg.workspaceId,
        worktreeStrategy: cfg.worktreeStrategy,
        mergeStrategy: cfg.mergeStrategy,
        status: cfg.status,
        createdAt: cfg.createdAt,
        leadAgentId: cfg.leadAgentId,
        members: cfg.members.map((m) => ({
          agentId: m.agentId,
          name: m.name,
          branch: m.branch,
          worktreePath: m.worktreePath,
          tmuxPaneId: m.tmuxPaneId,
          state: m.state,
          task: m.task,
        })),
      })
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }

  // ── Create ───────────────────────────────────────────────────────────

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
        if (!isPathInside(teamRoot, worktreePath)) {
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
              { timeout: 30_000, env: this.tmuxEnv() }
            )
            member.worktreePath = worktreePath
            member.branch = memberBranch
            memberCwd = worktreePath
            worktreesCreated++
          } catch {
            memberCwd = wsPath
          }
        }
      } else {
        member.worktreePath = wsPath
        member.branch = baseBranch
        memberCwd = wsPath
      }

      // ── tmux session ───────────────────────────────────────────────
      if (tmuxOk && memberCwd) {
        const session = teamSessionName(teamId, m.agentId)
        const tmux = this.tmuxBin()
        const env = this.tmuxEnv()
        try {
          await execFileAsync(
            tmux,
            ['new-session', '-d', '-s', session, '-c', memberCwd],
            { timeout: 8000, env }
          )
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
            // pane lookup failed
          }
          if (autoStart) {
            try {
              await execFileAsync(tmux, ['send-keys', '-t', session, 'claude', 'Enter'], {
                timeout: 4000,
                env,
              })
            } catch {
              // ignore
            }
          }
          if (realPaneId) {
            member.tmuxPaneId = realPaneId
            member.backendType = 'tmux'
            member.cwd = memberCwd
            tmuxSessionsStarted++
          } else {
            member.cwd = memberCwd
          }
        } catch {
          // tmux unavailable / collision
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

    return { teamId, configPath, worktreesCreated, tmuxSessionsStarted }
  }

  // ── Read / Write config ──────────────────────────────────────────────

  async readConfig(
    workspacePath: string | null,
    teamId: string
  ): Promise<{ configPath: string; config: RawConfig } | null> {
    const teamsDir = this.teamsDirFor(workspacePath)
    const configPath = path.join(teamsDir, teamId, 'config.json')
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8')) as RawConfig
      return { configPath, config }
    } catch {
      return null
    }
  }

  async writeConfig(configPath: string, config: RawConfig): Promise<void> {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  // ── Pause / Resume ───────────────────────────────────────────────────

  private async resolvePanePid(paneId: string): Promise<number | null> {
    if (!isTmuxPaneId(paneId)) return null
    try {
      const { stdout } = await execFileAsync(
        this.tmuxBin(),
        ['display-message', '-p', '-t', paneId, '#{pane_pid}'],
        { timeout: 3000, env: this.tmuxEnv() }
      )
      const pid = parseInt(stdout.trim(), 10)
      return Number.isFinite(pid) && pid > 0 ? pid : null
    } catch {
      return null
    }
  }

  private signalPaneTree(pid: number, signal: 'SIGSTOP' | 'SIGCONT'): boolean {
    try {
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

  async pause(
    workspacePath: string | null,
    teamId: string
  ): Promise<{ ok: boolean; degraded?: boolean }> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(workspacePath, teamId)
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
        const session = teamSessionName(teamId, m.agentId)
        await execFileAsync(this.tmuxBin(), ['detach-client', '-s', session], {
          timeout: 3000,
          env: this.tmuxEnv(),
        }).catch(() => {})
        degraded = true
      }
    }
    await this.writeConfig(found.configPath, found.config)
    return { ok: true, degraded }
  }

  async resume(
    workspacePath: string | null,
    teamId: string
  ): Promise<{ ok: boolean; degraded?: boolean }> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(workspacePath, teamId)
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
    return { ok: true, degraded }
  }

  async pauseMember(
    workspacePath: string | null,
    teamId: string,
    agentId: string
  ): Promise<{ ok: boolean; degraded?: boolean }> {
    if (!teamId || !agentId) throw new Error('teamId and agentId are required')
    const found = await this.readConfig(workspacePath, teamId)
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
        await execFileAsync(this.tmuxBin(), ['detach-client', '-s', session], {
          timeout: 3000,
          env: this.tmuxEnv(),
        }).catch(() => {})
        degraded = true
      }
    } else {
      degraded = true
    }
    await this.writeConfig(found.configPath, found.config)
    return { ok: true, degraded }
  }

  async resumeMember(
    workspacePath: string | null,
    teamId: string,
    agentId: string
  ): Promise<{ ok: boolean; degraded?: boolean }> {
    if (!teamId || !agentId) throw new Error('teamId and agentId are required')
    const found = await this.readConfig(workspacePath, teamId)
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
    return { ok: true, degraded }
  }

  // ── Merge ────────────────────────────────────────────────────────────

  async merge(
    workspacePath: string | null,
    teamId: string,
    opts: TeamMergeOptions = {}
  ): Promise<TeamMergeResult> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(workspacePath, teamId)
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
    const env = this.tmuxEnv()

    const dirty = await this.workspaceDirty(wsPath)
    if (dirty) {
      return {
        ok: false,
        conflicts: [],
        error: 'workspace has uncommitted changes; commit or stash before merging the team',
      }
    }

    try {
      await execFileAsync('git', ['-C', wsPath, 'checkout', baseBranch], { timeout: 10_000, env })
    } catch (err) {
      return {
        ok: false,
        conflicts: [],
        error: `failed to checkout ${baseBranch}: ${(err as Error).message}`,
      }
    }

    const memberBranches = cfg.members
      .map((m) => m.branch)
      .filter((b): b is string => !!b && b !== baseBranch)

    for (const branch of memberBranches) {
      const args = strategy === 'squash'
        ? ['-C', wsPath, 'merge', '--squash', branch]
        : ['-C', wsPath, 'merge', '--no-ff', '--no-edit', branch]
      try {
        await execFileAsync('git', args, { timeout: 30_000, env })
      } catch (err) {
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
        try {
          await execFileAsync(
            'git',
            ['-C', wsPath, 'commit', '-m', `team(${teamId}): squash merge ${branch}`],
            { timeout: 10_000, env }
          )
        } catch (err) {
          const stderr = ((err as { stderr?: Buffer | string }).stderr ?? '').toString().trim()
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

      const stillDirty = await this.workspaceDirty(wsPath)
      if (stillDirty) {
        return {
          ok: false,
          conflicts: [],
          error: `workspace not clean after merging ${branch}; aborting`,
        }
      }
    }

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

  private async workspaceDirty(wsPath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', wsPath, 'status', '--porcelain'],
        { timeout: 5000, env: this.tmuxEnv() }
      )
      const lines = stdout.split('\n').map((l) => l.trimEnd()).filter(Boolean)
      const userDirty = lines.filter((line) => {
        const rest = line.slice(3)
        const arrow = rest.indexOf(' -> ')
        const filePath = (arrow >= 0 ? rest.slice(arrow + 4) : rest).replace(/^"(.*)"$/, '$1')
        return !this.isForgeOwnedPath(filePath)
      })
      return userDirty.length > 0
    } catch {
      return true
    }
  }

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
        { timeout: 5000, env: this.tmuxEnv() }
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
        const start = buf.indexOf('<<<<<<<')
        const end = buf.indexOf('>>>>>>>', start)
        if (start >= 0 && end > start) {
          conflictMarkers = buf.slice(start, end + 80).split('\n').slice(0, 60).join('\n')
        }
      } catch {
        // unreadable
      }
      out.push({ file, theirsBranch, oursBranch, conflictMarkers })
    }
    return out
  }

  // ── Remove ───────────────────────────────────────────────────────────

  async remove(workspacePath: string | null, teamId: string): Promise<void> {
    if (!teamId) throw new Error('teamId is required')
    const found = await this.readConfig(workspacePath, teamId)
    const tmuxOk = await this.hasTmux()
    const gitOk = await this.hasGit()

    if (found) {
      const cfg = found.config
      const wsPath = cfg.workspacePath
      const env = this.tmuxEnv()

      if (tmuxOk) {
        const tmux = this.tmuxBin()
        for (const m of cfg.members) {
          const session = teamSessionName(teamId, m.agentId)
          await execFileAsync(tmux, ['kill-session', '-t', session], {
            timeout: 3000,
            env,
          }).catch(() => {})
        }
      }

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
        for (const m of cfg.members) {
          if (!m.branch || !m.branch.startsWith(`team/${teamId}`)) continue
          if (m.branch === cfg.baseBranch) continue
          await execFileAsync('git', ['-C', wsPath, 'branch', '-D', m.branch], {
            timeout: 5000,
            env,
          }).catch(() => {})
        }
        const teamBase = cfg.baseBranch ?? `team/${teamId}`
        await execFileAsync('git', ['-C', wsPath, 'branch', '-D', teamBase], {
          timeout: 5000,
          env,
        }).catch(() => {})
      }
    }

    const teamsDir = this.teamsDirFor(workspacePath)
    const target = path.join(teamsDir, teamId)
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
  }
}
