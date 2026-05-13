/**
 * TeamActivityTracker — converts on-disk member worktree changes into
 * structured `ActivityEvent` records the renderer's RunLiveView feed renders
 * in real time.
 *
 * Per team we watch:
 *   1. Each member's `worktreePath` (chokidar) — fires `edit` events with
 *      git-diff-derived line counts on file change/add. Synthetic shadow
 *      directories are filtered (`.git`, `node_modules`, etc).
 *   2. Each member's `worktreePath/.git/HEAD` (polling 1s) — when HEAD moves,
 *      we resolve the new commit's message + file list and emit `commit`.
 *   3. The team `config.json` (chokidar) — diffing the previous member states
 *      yields `state-change` events.
 *
 * All events are mirrored into `~/.claude-forge/team-activity/<teamId>.jsonl`
 * for crash-tolerant history. The renderer pulls the tail with `list()` and
 * subscribes to live pushes via `subscribe()`.
 *
 * External tools (git) are gated — when missing we degrade to filename-only
 * edits (no line counts) and skip commit polling. chokidar is required.
 */
import * as chokidar from 'chokidar'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { existsSync, mkdirSync, createWriteStream, type WriteStream } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'

const execFileAsync = promisify(execFile)

export type ActivityKind = 'edit' | 'commit' | 'state-change'

export interface ActivityEvent {
  /** Unix ms timestamp the event was observed. */
  ts: number
  /** Team this event belongs to. */
  teamId: string
  /** Member agentId / name responsible for the event. */
  agent: string
  kind: ActivityKind
  /** Changed file path, relative to the worktree root. */
  file?: string
  /** Lines added (git diff numstat). */
  added?: number
  /** Lines removed (git diff numstat). */
  removed?: number
  /** Commit subject — first line of the commit message. */
  message?: string
  /** File paths changed in the commit. */
  files?: string[]
  /** Short HEAD sha for commit events. */
  sha?: string
  /** Member state transition (state-change events). */
  from?: string
  to?: string
  /** Free-form text for unstructured events / fallbacks. */
  text?: string
}

export interface MemberSpec {
  agentId: string
  name?: string
  worktreePath?: string
  state?: string
}

interface MemberWatcher {
  agentId: string
  worktreePath: string
  /** Last seen HEAD sha — undefined until first poll. */
  lastHead?: string
  fsWatcher: chokidar.FSWatcher
  /** Set of files we already emitted within the debounce window. */
  recentlyEmitted: Map<string, number>
}

interface TeamWatcher {
  teamId: string
  members: Map<string, MemberWatcher>
  configWatcher: chokidar.FSWatcher | null
  configPath: string
  lastMemberStates: Map<string, string>
  /** 직전 emit 된 state-change event 의 agentId → {ts, to}. 5초 안에 round-trip
   *  (예: active→idle 직후 idle→active) 발생하면 flap 으로 판단하고 둘 다 suppress. */
  recentStateChanges: Map<string, { ts: number; to: string }>
  headPollTimer: NodeJS.Timeout | null
  jsonlStream: WriteStream | null
  jsonlPath: string
}

const DEFAULT_LOG_DIR = path.join(os.homedir(), '.claude-forge', 'team-activity')

/** chokidar ignore globs for member worktree watching. */
const IGNORE_PATTERNS = [
  /(^|[/\\])\..+/,     // dotfiles / dotdirs
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/__pycache__/**',
]

export class TeamActivityTracker extends EventEmitter {
  private teams = new Map<string, TeamWatcher>()
  private logDir: string
  private gitAvailable: boolean | null = null

  constructor(logDir: string = DEFAULT_LOG_DIR) {
    super()
    this.logDir = logDir
    try {
      mkdirSync(this.logDir, { recursive: true })
    } catch {
      // best-effort — emit() still works without persistence
    }
  }

  /** Lazy git probe — cached since PATH is stable per process. */
  private async hasGit(): Promise<boolean> {
    if (this.gitAvailable !== null) return this.gitAvailable
    try {
      await execFileAsync('git', ['--version'], { timeout: 3000 })
      this.gitAvailable = true
    } catch {
      this.gitAvailable = false
    }
    return this.gitAvailable
  }

  /**
   * Start watching a team's members. Idempotent: calling start() again with
   * the same teamId stops the previous watcher first.
   */
  async start(teamId: string, members: MemberSpec[], configPath?: string): Promise<void> {
    if (!teamId) return
    // Stop existing watcher if any.
    await this.stop(teamId)

    const memberMap = new Map<string, MemberWatcher>()
    const lastStates = new Map<string, string>()
    for (const m of members) {
      lastStates.set(m.agentId, m.state ?? 'active')
      if (!m.worktreePath) continue
      try {
        const exists = existsSync(m.worktreePath)
        if (!exists) continue
      } catch {
        continue
      }
      const mw = this.spawnMemberWatcher(teamId, m)
      if (mw) memberMap.set(m.agentId, mw)
    }

    let configWatcher: chokidar.FSWatcher | null = null
    if (configPath && existsSync(configPath)) {
      try {
        configWatcher = chokidar.watch(configPath, {
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
        })
        configWatcher.on('change', () => {
          this.handleConfigChange(teamId).catch(() => {
            // ignore — best-effort
          })
        })
      } catch {
        configWatcher = null
      }
    }

    let jsonlStream: WriteStream | null = null
    const jsonlPath = path.join(this.logDir, `${teamId}.jsonl`)
    try {
      jsonlStream = createWriteStream(jsonlPath, { flags: 'a' })
      jsonlStream.on('error', () => {
        // disk full / permission — drop persistence but keep emitting
        jsonlStream = null
      })
    } catch {
      jsonlStream = null
    }

    const watcher: TeamWatcher = {
      teamId,
      members: memberMap,
      configWatcher,
      configPath: configPath ?? '',
      lastMemberStates: lastStates,
      recentStateChanges: new Map(),
      headPollTimer: null,
      jsonlStream,
      jsonlPath,
    }
    this.teams.set(teamId, watcher)

    // HEAD poll — single 1s timer per team scans all member worktrees.
    if (await this.hasGit()) {
      watcher.headPollTimer = setInterval(() => {
        this.pollHeads(teamId).catch(() => {
          // ignore — transient git failure
        })
      }, 1000)
    }
  }

  private spawnMemberWatcher(teamId: string, member: MemberSpec): MemberWatcher | null {
    if (!member.worktreePath) return null
    let fsWatcher: chokidar.FSWatcher
    try {
      fsWatcher = chokidar.watch(member.worktreePath, {
        persistent: true,
        ignoreInitial: true,
        ignored: IGNORE_PATTERNS,
        depth: 8,
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
      })
    } catch {
      return null
    }

    const mw: MemberWatcher = {
      agentId: member.agentId,
      worktreePath: member.worktreePath,
      fsWatcher,
      recentlyEmitted: new Map(),
    }

    const handle = (filePath: string) => {
      // Coalesce repeated edits to the same file within 1.5s.
      const now = Date.now()
      const last = mw.recentlyEmitted.get(filePath) ?? 0
      if (now - last < 1500) return
      mw.recentlyEmitted.set(filePath, now)
      // Lazy GC of the dedup map.
      if (mw.recentlyEmitted.size > 256) {
        for (const [k, v] of mw.recentlyEmitted) {
          if (now - v > 60_000) mw.recentlyEmitted.delete(k)
        }
      }
      this.handleFileChange(teamId, mw, filePath).catch(() => {
        // ignore
      })
    }

    fsWatcher.on('change', handle).on('add', handle)
    fsWatcher.on('error', () => {
      // Many transient errors are benign (EMFILE etc) — don't tear down the
      // watcher, chokidar will recover.
    })
    return mw
  }

  private async handleFileChange(
    teamId: string,
    mw: MemberWatcher,
    filePath: string,
  ): Promise<void> {
    const rel = path.relative(mw.worktreePath, filePath) || path.basename(filePath)
    const event: ActivityEvent = {
      ts: Date.now(),
      teamId,
      agent: mw.agentId,
      kind: 'edit',
      file: rel,
    }

    if (await this.hasGit()) {
      try {
        // --numstat against HEAD — captures uncommitted changes vs. last
        // commit. Returns "<added>\t<removed>\t<file>" lines.
        const { stdout } = await execFileAsync(
          'git',
          ['-C', mw.worktreePath, 'diff', '--numstat', '--', rel],
          { timeout: 4000 },
        )
        const line = stdout.split('\n').find((l) => l.trim().length > 0)
        if (line) {
          const parts = line.split('\t')
          const added = Number(parts[0])
          const removed = Number(parts[1])
          if (Number.isFinite(added)) event.added = added
          if (Number.isFinite(removed)) event.removed = removed
        }
      } catch {
        // ignore — emit edit without numbers
      }
    }
    this.emitEvent(teamId, event)
  }

  private async pollHeads(teamId: string): Promise<void> {
    const t = this.teams.get(teamId)
    if (!t) return
    for (const mw of t.members.values()) {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['-C', mw.worktreePath, 'rev-parse', 'HEAD'],
          { timeout: 3000 },
        )
        const sha = stdout.trim()
        if (!sha) continue
        if (mw.lastHead === undefined) {
          mw.lastHead = sha
          continue
        }
        if (sha === mw.lastHead) continue

        // HEAD moved — fetch the commit subject + file list.
        let message = ''
        try {
          const { stdout: subj } = await execFileAsync(
            'git',
            ['-C', mw.worktreePath, 'log', '-1', '--pretty=%s', sha],
            { timeout: 3000 },
          )
          message = subj.trim()
        } catch {
          // ignore
        }
        let files: string[] = []
        try {
          const { stdout: fl } = await execFileAsync(
            'git',
            ['-C', mw.worktreePath, 'show', '--name-only', '--pretty=', sha],
            { timeout: 3000 },
          )
          files = fl.split('\n').map((s) => s.trim()).filter(Boolean)
        } catch {
          // ignore
        }
        const event: ActivityEvent = {
          ts: Date.now(),
          teamId,
          agent: mw.agentId,
          kind: 'commit',
          message,
          files,
          sha: sha.slice(0, 7),
        }
        this.emitEvent(teamId, event)
        mw.lastHead = sha
      } catch {
        // git failed — skip this round
      }
    }
  }

  private async handleConfigChange(teamId: string): Promise<void> {
    const t = this.teams.get(teamId)
    if (!t || !t.configPath) return
    let raw: string
    try {
      raw = await fs.readFile(t.configPath, 'utf-8')
    } catch {
      return
    }
    let parsed: { members?: { agentId: string; state?: string }[] }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const newStates = new Map<string, string>()
    for (const m of parsed.members ?? []) {
      newStates.set(m.agentId, m.state ?? 'active')
    }
    const now = Date.now()
    for (const [agentId, next] of newStates) {
      const prev = t.lastMemberStates.get(agentId)
      if (prev === undefined || prev === next) continue
      // Flap suppression: chokidar 의 awaitWriteFinish 가 잡지 못한 짧은
      // round-trip (active → idle → active 가 5 초 안에 같은 멤버에
      // 발생) 은 진짜 토글이 아닌 config 재기록 noise 로 간주. 사용자가
      // 보고한 "활동 패널 idle↔active 무의미한 flap" 결함의 근본 fix.
      const recent = t.recentStateChanges.get(agentId)
      if (recent && recent.to === prev && now - recent.ts < 5000) {
        // 직전 transition 의 to 가 지금 prev 와 같음 = round-trip 의 두 번째 leg.
        // 첫 leg 도 함께 무시 (recentStateChanges 에서 제거 + 이번 emit 도 skip).
        t.recentStateChanges.delete(agentId)
        continue
      }
      const event: ActivityEvent = {
        ts: now,
        teamId,
        agent: agentId,
        kind: 'state-change',
        from: prev,
        to: next,
      }
      this.emitEvent(teamId, event)
      t.recentStateChanges.set(agentId, { ts: now, to: next })
    }
    t.lastMemberStates = newStates
  }

  private emitEvent(teamId: string, event: ActivityEvent): void {
    const t = this.teams.get(teamId)
    if (!t) return
    if (t.jsonlStream) {
      try {
        t.jsonlStream.write(JSON.stringify(event) + '\n')
      } catch {
        // ignore
      }
    }
    this.emit('event', event)
    this.emit(`event:${teamId}`, event)
  }

  /** Returns the most recent N events for a team from the JSONL log. */
  async list(teamId: string, limit = 100): Promise<ActivityEvent[]> {
    if (!teamId) return []
    const file = path.join(this.logDir, `${teamId}.jsonl`)
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      return []
    }
    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    const tail = lines.slice(-limit)
    const out: ActivityEvent[] = []
    for (const l of tail) {
      try {
        out.push(JSON.parse(l) as ActivityEvent)
      } catch {
        // ignore corrupt line
      }
    }
    return out
  }

  /** Stop a single team's watchers + close the JSONL stream. */
  async stop(teamId: string): Promise<void> {
    const t = this.teams.get(teamId)
    if (!t) return
    if (t.headPollTimer) {
      clearInterval(t.headPollTimer)
      t.headPollTimer = null
    }
    for (const mw of t.members.values()) {
      try {
        await mw.fsWatcher.close()
      } catch {
        // ignore
      }
    }
    t.members.clear()
    if (t.configWatcher) {
      try {
        await t.configWatcher.close()
      } catch {
        // ignore
      }
      t.configWatcher = null
    }
    if (t.jsonlStream) {
      try {
        t.jsonlStream.end()
      } catch {
        // ignore
      }
      t.jsonlStream = null
    }
    this.teams.delete(teamId)
  }

  /** Stop every team — used on app shutdown. */
  async stopAll(): Promise<void> {
    const ids = Array.from(this.teams.keys())
    for (const id of ids) {
      await this.stop(id)
    }
  }

  /** Snapshot of currently tracked team ids. */
  trackedTeams(): string[] {
    return Array.from(this.teams.keys())
  }
}
