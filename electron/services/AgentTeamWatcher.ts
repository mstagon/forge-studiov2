import * as chokidar from 'chokidar'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'

const execFileAsync = promisify(execFile)

export type AgentStatus = 'running' | 'idle' | 'shutdown'
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
}

interface RawConfig {
  name: string
  description?: string
  goal?: string
  workspaceId?: string
  worktreeStrategy?: WorktreeStrategy
  mergeStrategy?: MergeStrategy
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  members: RawMember[]
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
      this.refresh().then(() => this.emit('teams', this.list())).catch(() => {})
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
   * Create a new team config under `<workspacePath>/.claude/teams/<teamId>/`.
   * Worktree provisioning + tmux backend wiring are out of scope here — this
   * just lays down `config.json` so chokidar refresh picks it up. The lead
   * agent is the first member; status defaults to 'running' (the watcher will
   * adjust once inboxes exist).
   *
   * NOTE: worktree auto-creation per member is intentionally deferred.
   */
  async create(opts: TeamCreateOptions): Promise<{ teamId: string; configPath: string }> {
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
    const rawMembers: RawMember[] = opts.members.map((m, idx) => ({
      agentId: m.agentId,
      // Member `name` doubles as the inbox filename — keep it filesystem-safe
      // and unique within the team. We don't have a real display name yet, so
      // re-use agentId with an index suffix when collisions would arise.
      name: m.agentId,
      agentType: m.agentId,
      model: 'sonnet-4.5',
      joinedAt: now + idx,
      task: m.task,
    }))
    const config: RawConfig = {
      name: opts.name,
      goal: opts.goal,
      workspaceId: opts.workspaceId,
      worktreeStrategy: opts.worktreeStrategy,
      mergeStrategy: opts.mergeStrategy,
      createdAt: now,
      leadAgentId,
      members: rawMembers,
    }
    const configPath = path.join(teamRoot, 'config.json')
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    // chokidar is debounced; nudge the cache immediately so the renderer can
    // see the new team without waiting for the next refresh tick.
    await this.refresh()
    this.emit('teams', this.list())
    return { teamId, configPath }
  }

  /**
   * Remove a team's config directory. The chokidar `unlinkDir` listener will
   * pick this up and refresh the cache, but we eagerly refresh + emit so the
   * caller sees the removal synchronously.
   */
  async remove(teamId: string): Promise<void> {
    if (!teamId) throw new Error('teamId is required')
    const target = path.join(this.teamsDir, teamId)
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
    await this.refresh()
    this.emit('teams', this.list())
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
  }
}
