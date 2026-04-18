import * as chokidar from 'chokidar'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { EventEmitter } from 'events'

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
}

interface RawConfig {
  name: string
  description?: string
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
  private teamsDir = path.join(os.homedir(), '.claude', 'teams')
  private watcher: chokidar.FSWatcher | null = null
  private cache: Map<string, Team> = new Map()
  private refreshTimer: NodeJS.Timeout | null = null

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
      })
    }
    return {
      id,
      name: config.name,
      description: config.description,
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

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
  }
}
