import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
// .ts 확장자 명시 — Node 의 --experimental-strip-types 가 packaged
// forge-team CLI 에서 module 을 resolve 할 때 ESM resolver 가 implicit
// extension 을 안 채워주므로 명시 필요 (v0.9.4 fix). bin/forge-team.ts
// 도 같은 패턴으로 './TeamOperations.ts' 명시 중.
import { resolveProvider } from './ProviderRouter.ts'
import { loadForgeConfig, authScrubbedEnv } from './ForgeConfig.ts'

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
export type TeamStatus = 'active' | 'paused' | 'done'
export type WorktreeStrategy = 'isolated' | 'shared'
export type MergeStrategy = 'squash' | 'sequential'

export interface TeamCreateMember {
  agentId: string
  task?: string
  /**
   * Provider model id. Routes to the correct CLI on autoStart:
   *   - claude / opus / sonnet / haiku  →  `claude --dangerously-skip-permissions`
   *   - gpt / o1 / o3 / codex            →  `codex --dangerously-bypass-approvals-and-sandbox`
   * Defaults to claude (Anthropic) when omitted.
   */
  model?: string
  /**
   * 자기 책임 파일/디렉토리 path 들. 다른 멤버는 건드리지 말 것 — 메인 세션의
   * Phase 1 plan 의 expectedFiles 와 동일. autoStart task prompt 에 자동
   * 포함되어 멤버 claude/codex 가 자기 영역 + 다른 멤버 영역 알고 충돌 회피.
   * Shared worktree 모드에서 특히 중요.
   */
  expectedFiles?: string[]
  /**
   * 멤버의 역할 한 줄 — Frontend / Backend / Database 등. autoStart prompt
   * 에 명시되어 멤버가 자기 정체성 명확. 빠뜨리면 agentId 에서 자동 추론.
   */
  role?: string
}

/** Map a model identifier to the bypass-mode launch command. */
export function modelLaunchCommand(model: string | undefined): string {
  return resolveProvider(model).launchCommand
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
  /**
   * 협의 모드: true 면 각 멤버 inbox 에 "Round 1: 자기 제안 작성 후 다른
   * 멤버들에게 forge-team-cli 로 메시지 전달, Round 2: 다른 멤버 inbox
   * 읽고 critique, Round 3: 합의안" 지시 메시지를 spawn 직후 자동 기록.
   * Claude/Codex 가 첫 turn 에 inbox 읽고 따르도록 prompt engineering.
   */
  council?: boolean
}

export interface TeamCreateResult {
  teamId: string
  configPath: string
  worktreesCreated: number
  tmuxSessionsStarted: number
  /** True iff team was created with `council: true` and at least one
   *  inbox seed message was attempted. */
  council?: boolean
  /** Number of council inbox seed messages successfully written
   *  (== members.length on full success). 0 when council disabled. */
  councilSeeded?: number
  /** Per-member inbox failures during council seeding. Empty on success. */
  councilSeedErrors?: Array<{ member: string; error: string }>
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
  /** 멤버 결과가 back-merge 된 원래 브랜치 (v0.13.0 — parentBranch 통합). */
  integratedInto?: string
  /** merge 성공 후 자동 archive 까지 완료됐는지. */
  archived?: boolean
}

export interface TeamMergeOptions {
  mergeStrategy?: MergeStrategy
  /** merge 성공 후 worktree/tmux/브랜치 자동 정리 (기본 true). config 는
   *  history 로 보존. CLI 의 --no-archive 가 false 로 내린다. */
  autoArchive?: boolean
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
  /** 멤버 단위 완료 시각 (ISO). `forge-team complete-member` 호출 시 set.
   *  team-level done 은 모든 멤버 completedAt 채워질 때만 transition. */
  completedAt?: string
  /** 멤버 완료 시 함께 기록되는 한 줄 산출물 요약 (UI 표시). */
  completionMessage?: string
  /** 자기 책임 영역 — autoStart prompt + Discussion/충돌 감지에 활용. */
  expectedFiles?: string[]
  /** 멤버 역할 (Frontend/Backend/Database 등). */
  role?: string
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
  /** 팀 생성 시 워크스페이스가 체크아웃하고 있던 원래 브랜치. merge 의 최종
   *  통합 대상 — team base branch 의 결과를 여기로 back-merge 한다 (v0.13.0). */
  parentBranch?: string
  /** merge 성공 시각 (ISO). archive 의 미통합 작업 보호 판정에 사용. */
  mergedAt?: string
  /** archive 시각 (ISO). worktree/tmux/브랜치는 정리됐고 config 는 history
   *  로 보존된 상태. GUI 는 이 값으로 Active / Done 팀을 분리 표시. */
  archivedAt?: string
  /** Council 모드로 생성된 팀. Sprint/Discussion 뷰가 round-robin 진행
   *  표시 + Stop hook 이 다음 round 자동 진행 시 참조. */
  council?: boolean
}

export interface TeamSummary {
  id: string
  name: string
  goal?: string
  workspaceId?: string
  worktreeStrategy?: WorktreeStrategy
  mergeStrategy?: MergeStrategy
  status?: TeamStatus
  mergedAt?: string
  archivedAt?: string
  createdAt: number
  leadAgentId: string
  council?: boolean
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
  /**
   * In-process serialization for inbox read-modify-write.
   * 같은 inbox 파일에 대한 동시 쓰기를 직렬화. 같은 프로세스 안의 동시
   * sendInboxMessage / markInboxRead 가 서로의 변경 덮어쓰는 걸 방지.
   * Cross-process 안전은 별도의 파일 락 (O_CREAT|O_EXCL) 으로 처리.
   */
  private inboxWriteQueue = new Map<string, Promise<unknown>>()

  constructor(deps: TeamOperationsDeps) {
    this.tmuxBin = deps.tmuxBin
    this.tmuxEnv = deps.tmuxEnv
    this.teamsDirFor = deps.teamsDirFor ?? defaultTeamsDirFor
  }

  /**
   * 같은 inbox 파일 RMW 를 in-process 직렬화 + cross-process O_EXCL 락으로
   * 보호. 두 send 가 같은 old array 를 읽고 나중 write 가 먼저 write 를
   * 덮어쓰는 협의 모드 데이터 손실 시나리오 방지.
   */
  private async withInboxLock<T>(inboxPath: string, work: () => Promise<T>): Promise<T> {
    // Step 1: in-process queue — 같은 프로세스의 다른 awaiter 들과 줄세움.
    const prior = this.inboxWriteQueue.get(inboxPath) ?? Promise.resolve()
    let releaseLocal!: () => void
    const localTicket = new Promise<void>((resolve) => {
      releaseLocal = resolve
    })
    const chained = prior.then(() => localTicket)
    this.inboxWriteQueue.set(inboxPath, chained)
    await prior

    // Step 2: cross-process lock — sibling .lock 파일을 O_CREAT|O_EXCL 로
    // 잡음. 다른 프로세스 (forge-team CLI 등) 가 들고 있으면 stale 검사 후
    // 짧은 backoff 로 재시도.
    const lockPath = `${inboxPath}.lock`
    const acquireDeadline = Date.now() + 5000
    const staleThresholdMs = 30_000
    let releasedLock = false
    const releaseLock = async () => {
      if (releasedLock) return
      releasedLock = true
      try {
        await fs.unlink(lockPath)
      } catch {
        // 락 이미 사라짐 (다른 프로세스가 stale 로 회수했을 수 있음)
      }
    }

    try {
      while (true) {
        try {
          const handle = await fs.open(lockPath, 'wx')
          try {
            await handle.write(`${process.pid}\n`)
          } finally {
            await handle.close()
          }
          break
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
          // 락이 너무 오래된 (stale) 거면 회수
          try {
            const stat = await fs.stat(lockPath)
            if (Date.now() - stat.mtimeMs > staleThresholdMs) {
              await fs.unlink(lockPath).catch(() => {})
              continue
            }
          } catch {
            // 락 파일 사라짐 — 즉시 retry
            continue
          }
          if (Date.now() > acquireDeadline) {
            throw new Error(`inbox lock timeout on ${inboxPath}`)
          }
          await new Promise((r) => setTimeout(r, 50 + Math.random() * 50))
        }
      }

      // Step 3: critical section — 락 잡힌 상태에서 RMW 수행
      const result = await work()
      return result
    } finally {
      await releaseLock()
      releaseLocal()
      // 큐 head 가 우리면 정리 (다음 호출이 새로 시작하도록)
      if (this.inboxWriteQueue.get(inboxPath) === chained) {
        this.inboxWriteQueue.delete(inboxPath)
      }
    }
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

  /**
   * worktree 의 `.claude/scripts/` 가 main workspace 의 같은 디렉토리에
   * 있는데 worktree 에 없는 (= 보통 untracked, gitignored) 파일을 symlink
   * 해서 채움.
   *
   * 배경: `git worktree add` 는 git 추적 파일만 worktree 로 가져오는데,
   * `.claude/scripts/forge-council-stop.sh` 같은 hook 스크립트는 untracked
   * 인 경우가 많음 (배포로 들어가거나 로컬 설치). 멤버 claude 가 Stop
   * hook 실행하려고 `$CLAUDE_PROJECT_DIR/.claude/scripts/X.sh` 호출 →
   * not-found. non-blocking 이지만 매 Stop 마다 stderr 로그 + 실제로 hook
   * 안 돈다.
   *
   * 전략: main 의 .claude/scripts/* 를 looping, worktree 에 같은 이름의
   * 파일/링크가 없으면 main 파일로 symlink. 이미 있는 (git 추적된) 스크립트는
   * 그대로 두니 worktree 가 자기 branch 에서 수정해도 안전.
   */
  private async linkMissingClaudeScripts(
    workspacePath: string,
    worktreePath: string,
  ): Promise<void> {
    const mainScriptsDir = path.join(workspacePath, '.claude', 'scripts')
    const wtScriptsDir = path.join(worktreePath, '.claude', 'scripts')
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(mainScriptsDir, { withFileTypes: true })
    } catch {
      return // main 에 scripts 자체가 없으면 link 할 게 없음
    }
    await fs.mkdir(wtScriptsDir, { recursive: true })
    for (const e of entries) {
      if (!e.isFile() && !e.isSymbolicLink()) continue
      const targetPath = path.join(mainScriptsDir, e.name)
      const linkPath = path.join(wtScriptsDir, e.name)
      // 이미 있으면 (git 추적 또는 직전 spawn 의 symlink) skip
      try {
        await fs.access(linkPath)
        continue
      } catch {
        // 없음 → 만들기
      }
      try {
        await fs.symlink(targetPath, linkPath)
      } catch {
        // symlink 실패 (권한 등) → copy fallback
        try {
          await fs.copyFile(targetPath, linkPath)
        } catch {
          // 복사도 실패 — 이 파일만 skip
        }
      }
    }
  }

  /** Claude Code agent 정의 (.md) 의 YAML frontmatter 제거 — system prompt 본문만. */
  private stripFrontmatter(md: string): string {
    if (!md.startsWith('---')) return md
    const end = md.indexOf('\n---', 3)
    if (end < 0) return md
    return md.slice(end + 4).replace(/^\s*\n/, '')
  }

  /**
   * agent 정의 실주입 (v0.15) — `.claude/agents/<agentId>.md` 의 본문을
   * teamRoot/agents/ 에 sanitize 해서 복사. spawn 시:
   *   - claude 멤버: `--append-system-prompt "$(cat <path>)"` 로 system prompt 주입
   *   - codex 멤버: task brief 상단에 prepend (동등 플래그 없음)
   * 기존엔 정의가 spawn 에 전혀 안 쓰여 "전문 에이전트" 가 task prompt 텍스트
   * 한 장이었음 (감사 문서 참조). 정의 파일 없으면 null — 기존 동작 유지.
   */
  private async prepareAgentDef(
    wsPath: string,
    teamRoot: string,
    agentId: string,
    safeAgentId: string,
  ): Promise<{ path: string; body: string } | null> {
    const src = path.join(wsPath, '.claude', 'agents', `${agentId}.md`)
    try {
      const raw = await fs.readFile(src, 'utf-8')
      const body = this.stripFrontmatter(raw).trim()
      if (!body) return null
      const dir = path.join(teamRoot, 'agents')
      await fs.mkdir(dir, { recursive: true })
      const dest = path.join(dir, `${safeAgentId}.md`)
      await fs.writeFile(dest, body + '\n', 'utf-8')
      return { path: dest, body }
    } catch {
      return null
    }
  }

  /**
   * 빈 repo (initial commit 없음) 시 자동 initial commit 만들어 base 를 확보.
   * 워크스페이스가 `git init` 만 한 상태이거나 빈 디렉토리들만 있으면 branch
   * 자체가 못 만들어져 worktree 생성 실패 → silent fallback to shared 가
   * 발생. v0.9.5 — 사용자가 "빈 프로젝트로 팀 만들기" 시도해도 작동.
   */
  private async ensureInitialCommit(workspacePath: string): Promise<void> {
    const env = this.tmuxEnv()
    try {
      // `git rev-parse HEAD` 가 통과하면 commit 이미 있음 → no-op
      await execFileAsync('git', ['-C', workspacePath, 'rev-parse', 'HEAD'], {
        timeout: 3000,
        env,
      })
      return
    } catch {
      // commit 없음 — 진행
    }
    try {
      // 빈 commit 으로 base 만들기. 사용자 데이터 안 건드림.
      await execFileAsync(
        'git',
        ['-C', workspacePath, 'commit', '--allow-empty', '-m', 'forge-team: initial commit (auto)'],
        { timeout: 5000, env }
      )
    } catch (err) {
      // commit 자체 실패 — git config user.name/email 미설정 가능. 명시 fallback.
      const stderr = ((err as { stderr?: Buffer | string }).stderr ?? '').toString()
      if (stderr.includes('user.name') || stderr.includes('user.email')) {
        try {
          await execFileAsync('git', ['-C', workspacePath, 'config', 'user.name', 'Forge Team'], { timeout: 3000, env })
          await execFileAsync('git', ['-C', workspacePath, 'config', 'user.email', 'forge-team@local'], { timeout: 3000, env })
          await execFileAsync(
            'git',
            ['-C', workspacePath, 'commit', '--allow-empty', '-m', 'forge-team: initial commit (auto)'],
            { timeout: 5000, env }
          )
        } catch {
          // 두 번째 시도도 실패 — 그냥 계속 (worktree 생성 시 다시 실패할 거)
        }
      }
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
        mergedAt: cfg.mergedAt,
        archivedAt: cfg.archivedAt,
        createdAt: cfg.createdAt,
        leadAgentId: cfg.leadAgentId,
        council: cfg.council === true,
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
      // Empty repo guard: 빈 워크스페이스(initial commit 없음)는 branch 자체를
      // 못 만든다 → ensureBranch silent 실패 → worktreesCreated:0 fallback.
      // v0.9.5 — 자동 initial commit 로 base 보장 (사용자가 빈 폴더로 시작해도 작동).
      await this.ensureInitialCommit(wsPath)
      baseBranch = await this.resolveBaseBranch(wsPath)
      // baseBranch suffix `-base` — git refs hierarchy is filesystem-like and
      // a branch named `team/<id>` cannot coexist with member branches
      // `team/<id>/<agent>` (file vs directory clash). Pre-v0.6.6 layouts
      // hit this and silently fell back to shared mode. The `-base` suffix
      // keeps the parent dir `team/` clean: `team/<id>-base` is a file,
      // `team/<id>/` is a directory, both fit under the same parent.
      teamBaseBranch = `team/${teamId}-base`
      await this.ensureBranch(wsPath, teamBaseBranch, baseBranch)
    } else if (gitOk) {
      baseBranch = await this.resolveBaseBranch(wsPath)
    }

    let worktreesCreated = 0
    let tmuxSessionsStarted = 0
    const autoStart = opts.autoStartClaude !== false
    const councilEnabled = opts.council === true && opts.members.length > 1
    // 팀 동작 설정 — 하드코딩 대신 ~/.forge-studio/config.json (v0.13.0)
    const forgeCfg = loadForgeConfig()

    const rawMembers: RawMember[] = []
    // agentId → sanitize 된 agent 정의 (spawn 주입용). 정의 없으면 미등록.
    const agentDefs = new Map<string, { path: string; body: string }>()
    for (let idx = 0; idx < opts.members.length; idx++) {
      const m = opts.members[idx]
      const safeAgentId = m.agentId.replace(/[^A-Za-z0-9_-]/g, '_')
      if (!agentDefs.has(m.agentId)) {
        const def = await this.prepareAgentDef(wsPath, teamRoot, m.agentId, safeAgentId)
        if (def) agentDefs.set(m.agentId, def)
      }
      const member: RawMember = {
        agentId: m.agentId,
        name: m.agentId,
        agentType: m.agentId,
        // Honor the caller's model override; default 은 ForgeConfig 의
        // defaultMemberModel. The autoStart spawner reads this to pick the
        // right CLI (claude vs codex) with the matching bypass flag.
        model: m.model ?? forgeCfg.defaultMemberModel,
        joinedAt: now + idx,
        task: m.task,
        state: 'active',
        // v0.9.7 — boundary 정보. autoStart task prompt 가 자기 영역 + 다른
        // 멤버 영역 명시해서 shared/isolated 어느 모드든 충돌 회피.
        expectedFiles: m.expectedFiles,
        role: m.role,
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
            // worktree 가 git 추적 파일만 가져오므로 .claude/scripts/ 의 untracked
            // hook 스크립트 (forge-boundary-guard.sh, forge-council-stop.sh,
            // learn.sh 등) 가 누락 → Stop hook 마다 not-found 에러. main
            // workspace 의 .claude/scripts 의 missing 파일들을 worktree 로
            // symlink 해서 hook 들이 정상 실행.
            await this.linkMissingClaudeScripts(wsPath, worktreePath).catch((err) => {
              process.stderr.write(
                `[forge-team] .claude/scripts symlink 일부 실패 (${m.agentId}): ${(err as Error).message}\n`,
              )
            })
          } catch (err) {
            // v0.9.5 — silent fallback 대신 stderr 노출로 사용자가 진단 가능.
            // 흔한 원인: 워크스페이스에 commit 0 (ensureInitialCommit 가 fix
            // 시도하지만 실패할 수도) / 같은 worktree path 가 이미 존재 /
            // refs hierarchy 충돌.
            const stderr = ((err as { stderr?: Buffer | string }).stderr ?? '').toString().trim()
            const message = stderr || (err as Error).message
            process.stderr.write(
              `[forge-team] worktree 생성 실패 (${m.agentId}): ${message}\n` +
              `  → shared 모드로 fallback. 멤버는 메인 워크트리에서 작업.\n`
            )
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
        // v0.9.7 — FORGE_TEAM_ID + FORGE_MEMBER_NAME env 주입.
        // forge-boundary-guard.sh PreToolUse hook 이 이걸 보고 멤버 영역
        // 외 파일 수정 시도 차단. 메인 세션은 이 env 없어서 통과.
        // v0.19.1 — 구독 랩핑: 멤버 claude/codex 도 stray API 키 제거 후 spawn.
        const env = {
          ...authScrubbedEnv(this.tmuxEnv(), forgeCfg.authMode),
          FORGE_TEAM_ID: teamId,
          FORGE_MEMBER_NAME: member.name,
          FORGE_TEAM_NAME: opts.name,
        }
        try {
          await execFileAsync(
            tmux,
            ['new-session', '-d', '-s', session, '-c', memberCwd],
            { timeout: 8000, env }
          )
          // tmux mouse 모드 + copy-mode wheel binding 활성화 — 사용자가 팀
          // 멤버 터미널에서 휠 스크롤 가능. claude TUI 가 alt-screen buffer
          // 쓰지만 tmux 가 자기 pane history 를 따로 유지하므로 wheel 이
          // 자동으로 copy-mode 진입 → 자유 스크롤. 사용자 보고: "team 터미널
          // 그냥 스크롤 안 됨" 의 fix.
          await execFileAsync(
            tmux,
            ['set-option', '-t', session, '-g', 'mouse', 'on'],
            { timeout: 3000, env },
          ).catch(() => {
            // 옛 tmux 또는 옵션 거부 — 스크롤만 제한, 팀 작동엔 영향 없음
          })
          await execFileAsync(
            tmux,
            ['set-option', '-t', session, '-g', 'history-limit', String(forgeCfg.tmuxHistoryLimit)],
            { timeout: 3000, env },
          ).catch(() => {
            // default 2000 도 작동 — 단지 스크롤백 짧음
          })
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
              // bypass-permissions: 멤버는 자율 실행이 정책. 모델별 적절한
              // bypass flag 로 spawn. 격리 worktree + isolated tmux session 이라
              // blast radius 는 멤버 본인 worktree 로 한정됨.
              let launchCmd = modelLaunchCommand(member.model)
              // v0.15 — agent 정의 system prompt 주입 (claude 만; codex 는
              // task brief 상단에 prepend). $(cat) 은 멤버 shell 이 치환.
              const def = agentDefs.get(member.agentId)
              if (def && resolveProvider(member.model).provider === 'claude') {
                const quoted = def.path.replace(/'/g, `'\\''`)
                launchCmd += ` --append-system-prompt "$(cat '${quoted}')"`
              }
              await execFileAsync(tmux, ['send-keys', '-t', session, launchCmd, 'Enter'], {
                timeout: 4000,
                env,
              })
              // NOTE: task prompt 주입은 의도적으로 여기서 안 함. config.json
              // + council seed inbox 가 디스크에 완전히 들어간 다음 단일 별도
              // 패스에서 처리 (아래). 이렇게 해야:
              //   - peer list (다른 멤버) 가 완전 — 첫 멤버도 모든 멤버 명단 받음
              //   - council 멤버가 prompt 받기 전에 자기 inbox 의 seed 메시지가
              //     이미 거기 있음 (empty inbox 보고 혼란 X)
            } catch {
              // ignore — autoStart 실패는 non-fatal (사용자가 수동 send-keys 가능)
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
      parentBranch: baseBranch,
      council: councilEnabled,
    }
    const configPath = path.join(teamRoot, 'config.json')
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // Council 모드: 각 멤버 inbox 에 협의 지시 첫 메시지 자동 작성.
    // 멤버 claude/codex 가 spawn 직후 자기 inbox 보고 따르도록 prompt engineering.
    let councilSeeded = 0
    const councilSeedErrors: Array<{ member: string; error: string }> = []
    if (councilEnabled) {
      const teamGoal = opts.goal ?? opts.name
      const memberList = rawMembers.map((m) => m.name).join(', ')
      for (const m of rawMembers) {
        const others = rawMembers.filter((o) => o.name !== m.name).map((o) => o.name)
        const wsArg = opts.workspacePath ? ` --workspace "${opts.workspacePath}"` : ''
        const text = [
          `[협의 모드 자동 안내]`,
          ``,
          `당신은 팀 "${opts.name}" 의 멤버 "${m.name}". 목표: ${teamGoal}.`,
          `다른 멤버: ${others.join(', ')}.`,
          ``,
          `협의 라운드:`,
          `  1. 자기 제안 작성 → 다른 멤버 inbox 에 전달`,
          `     (${others.map((o) => `\`forge-team send-message${wsArg} --team-id ${teamId} --from ${m.name} --to ${o} --text "..."\``).join(' / ')})`,
          `  2. 다른 멤버의 inbox 메시지 읽고 critique + 본인 제안 보완`,
          `     (\`forge-team read-inbox${wsArg} --team-id ${teamId} --agent ${m.name}\`)`,
          `  3. 합의안 도출 → 모든 멤버에게 동일 메시지로 final 합의안 broadcast`,
          ``,
          `자기 worktree: ${m.worktreePath ?? '(공유)'}`,
          `자기 브랜치: ${m.branch ?? '(unset)'}`,
          ``,
          `참고: 모든 ${memberList} 가 같은 메시지를 받았음. 각자 1번부터 진행.`,
        ].join('\n')
        const res = await this.sendInboxMessage(
          opts.workspacePath,
          teamId,
          'forge-team',
          m.name,
          text,
          '협의 모드 안내'
        )
        if (res.ok) {
          councilSeeded++
        } else {
          councilSeedErrors.push({ member: m.name, error: res.error ?? 'unknown' })
        }
      }
    }

    // ── Pass 2: task prompt 주입 ──────────────────────────────────────
    // config.json + council seed inbox 둘 다 disk 에 안전히 들어간 후에만
    // 멤버에게 task prompt 전달. otherNames 도 완전한 rawMembers 기준.
    if (autoStart && tmuxOk) {
      const tmux = this.tmuxBin()
      for (const member of rawMembers) {
        if (!member.tmuxPaneId || !member.task) continue
        const session = teamSessionName(teamId, member.agentId)
        const env = {
          ...this.tmuxEnv(),
          FORGE_TEAM_ID: teamId,
          FORGE_MEMBER_NAME: member.name,
          FORGE_TEAM_NAME: opts.name,
        }
        const others = rawMembers.filter((o) => o.name !== member.name)
        const otherRoles = others
          .map((o) => {
            const roleLabel = o.role ? `${o.role} (${o.name})` : o.name
            const files = o.expectedFiles?.length
              ? ` — 영역: ${o.expectedFiles.join(', ')}`
              : ''
            return `  - ${roleLabel}${files}`
          })
          .join('\n')

        const wsArg = opts.workspacePath ? ` --workspace "${opts.workspacePath}"` : ''
        const lines: string[] = []
        lines.push(`[Forge Team 자동 안내] 당신은 팀 "${opts.name}" 의 멤버 "${member.name}".`)
        if (member.role) lines.push(`역할: ${member.role}`)
        lines.push(`팀 목표: ${opts.goal ?? opts.name}`)
        lines.push('')
        lines.push(`### 당신의 task`)
        lines.push(member.task)
        if (member.expectedFiles?.length) {
          lines.push('')
          lines.push(`### 당신의 책임 영역 (only these files)`)
          lines.push(member.expectedFiles.map((f) => `  - ${f}`).join('\n'))
          lines.push(`이 영역 외의 파일은 수정하지 마세요. 다른 멤버 영역 침범 금지.`)
        }
        if (others.length > 0) {
          lines.push('')
          lines.push(`### 같은 팀의 다른 멤버 (절대 그들 영역 건드리지 마세요)`)
          lines.push(otherRoles)
          lines.push(`다른 멤버 영역에 변경 필요하면 inbox 로 협의 요청:`)
          lines.push(`  \`forge-team send-message${wsArg} --team-id ${teamId} --from ${member.name} --to <상대> --text "..."\``)
        }
        lines.push('')
        lines.push(`### 작업 환경`)
        if (member.worktreePath && member.worktreePath !== wsPath) {
          lines.push(`- 자기 worktree: ${member.worktreePath} (격리됨, 다른 멤버와 별도)`)
          lines.push(`- 자기 브랜치: ${member.branch} — 작업 중 자유롭게 commit`)
          lines.push(`- 메인 세션이 추후 forge-team merge 로 통합`)
        } else {
          lines.push(`- 메인 디렉토리 공유 (shared mode — worktree 격리 X)`)
          lines.push(`- 자기 sub-directory / 영역만 수정. git add/commit 은 메인 세션 일괄 처리.`)
          lines.push(`- 다른 멤버와 git race 가능 — 자기 영역 외엔 절대 건드리지 말 것.`)
        }
        lines.push('')
        lines.push(`### 진행 룰`)
        lines.push(`- TDD 우선: 실패 테스트 먼저 → 통과 코드. 멤버에 test-writer 가 있으면 그 결과 활용.`)
        lines.push(`- 자기 task 외엔 손대지 말 것. 추가 작업 필요하면 메인 세션에게 inbox 로 의견 요청.`)
        lines.push(`- 막히면 inbox 로 메시지: \`forge-team send-message${wsArg} --team-id ${teamId} --from ${member.name} --to <상대> --text "..."\``)
        lines.push(`- 자기 inbox 확인: \`forge-team read-inbox${wsArg} --team-id ${teamId} --agent ${member.name}\``)
        lines.push(`- 충돌/혼란 시 사용자 결정 받기보다 우선 inbox 협의.`)
        lines.push('')
        lines.push(`### ⚠️ 작업 완료 시 (CRITICAL — 빠뜨리면 메인 세션이 영원히 대기)`)
        lines.push(`task 진짜로 끝났다고 판단되면 반드시 아래 명령 한 번 호출. 자기 pane`)
        lines.push(`에 "완료" 만 적어두면 메인은 모름. 이걸 호출해야:`)
        lines.push(`  1. config.json 의 자기 멤버에 completedAt 영속`)
        lines.push(`  2. 모든 멤버 완료되면 자동으로 team-level status='done' transition`)
        lines.push(`  3. 그 시점에 메인 inbox push + macOS 알림 + \`forge-team wait\` 폴링 메인이 exit 0`)
        lines.push('')
        lines.push(`  \`forge-team complete-member${wsArg} --team-id ${teamId} --agent ${member.name} --message "산출물 한 줄 요약"\``)
        lines.push('')
        lines.push(`주의: 자기 멤버만 완료 처리. 팀 전체 done 으로 강제 transition 하는 명령`)
        lines.push(`(\`forge-team complete --team-id ...\`) 은 호출 X — 그건 orchestrator/메인 전용.`)
        lines.push(`다른 멤버 작업 중인데 강제 호출하면 미완성 결과 merge 위험.`)
        lines.push('')
        lines.push(`불완전/blocked 면 호출 X — 그 경우 inbox 로 사유 보고하고 사용자 개입 기다림.`)
        lines.push(`완료 신호 전 자기 worktree 의 모든 변경을 commit 해 둘 것 — 모든 멤버 완료 후`)
        lines.push(`이 tmux 세션은 자동 정리되고, merge 후 worktree/브랜치도 자동 archive 됨.`)
        if (councilEnabled) {
          const otherNames = others.map((o) => o.name)
          lines.push('')
          lines.push(`### ⚠️ 협의(Council) 모드 — round-robin 토론`)
          lines.push(`이 팀은 협의 모드. 코드 바로 작성 X — 먼저 토론 → 합의안 후 구현.`)
          lines.push(`  Round 1 (proposal): 자기 제안 작성 → 다른 멤버 inbox 로 전송`)
          lines.push(`  Round 2 (critique): 다른 멤버 inbox 읽고 비판/보완 → 답신`)
          lines.push(`  Round 3 (consensus): 합의안 도출 또는 dissent 명시`)
          lines.push(`자기 inbox 에 협의 진행 안내 메시지가 이미 도착해 있음. 먼저 그것부터 읽어보세요.`)
          lines.push(`다른 멤버: ${otherNames.join(', ')}.`)
          lines.push(`Round 종료마다 forge-council-stop.sh hook 이 다음 round 안내 자동 inject.`)
        }
        lines.push('')
        lines.push(`이제 자율적으로 task 진행하세요.`)

        // codex 멤버: --append-system-prompt 동등 옵션이 없어 agent 정의를
        // task brief 상단에 prepend (claude 는 pass 1 에서 system prompt 주입).
        const memberDef = agentDefs.get(member.agentId)
        if (memberDef && resolveProvider(member.model).provider === 'codex') {
          lines.unshift('')
          lines.unshift(memberDef.body)
          lines.unshift('### 에이전트 정의 (당신의 역할 — system prompt 로 간주)')
        }

        const taskPrompt = lines.join('\n')

        // 핵심 fix: 멀티라인 텍스트를 tmux send-keys 로 보내면 \n 마다 Enter 로
        // 해석돼서 claude/codex 가 각 줄을 별도 prompt 로 submit. 결과: 빈
        // prompt 만 반복 submit → 화면이 비어보임. 해결: brief 를 파일로 쓰고
        // 한 줄 prompt 로 "이 파일 읽고 시작" 전달. 멀티라인은 파일에 안전.
        //
        // 파일명에 agentId 포함 (forge-task-<agentId>.md): shared 모드는 모든
        // 멤버 worktree 가 같은 workspace 경로라서 단일 forge-task.md 쓰면
        // 마지막 멤버 내용이 다른 멤버 prompt 도 덮어씀 → 멤버들이 남의 task
        // 읽고 잘못된 파일 수정. 멤버별 고유 파일명으로 격리.
        const memberCwd = member.worktreePath ?? member.cwd ?? wsPath
        const safeAgentIdForFile = member.agentId.replace(/[^A-Za-z0-9_-]/g, '_')
        const taskFileName = `forge-task-${safeAgentIdForFile}.md`
        const taskFile = path.join(memberCwd, '.claude', taskFileName)
        try {
          await fs.mkdir(path.dirname(taskFile), { recursive: true })
          await fs.writeFile(taskFile, taskPrompt, 'utf-8')
        } catch (err) {
          process.stderr.write(
            `[forge-team] task brief 파일 쓰기 실패 (${member.name}): ${(err as Error).message}\n`,
          )
          continue
        }

        // claude/codex 가 부팅 + (codex 의 경우) auto-update 끝날 때까지 충분히
        // 기다림. v0.10.0 의 1.5s 는 codex auto-update (11s+) 못 버팀.
        // 대기 시간은 ForgeConfig.memberBootWaitMs (기본 4s) — 느린 머신이면
        // Settings 에서 늘릴 수 있음.
        const oneLinePrompt = `먼저 .claude/${taskFileName} 를 Read 해서 자기 task / 책임 영역 / 다른 멤버 / 진행 룰 모두 확인. 그 다음 자율적으로 진행.`
        try {
          await new Promise<void>((resolve) => setTimeout(resolve, forgeCfg.memberBootWaitMs))
          // 텍스트와 Enter 를 분리해서 send. claude code TUI 가 bracketed
          // paste 모드라 text + Enter 한 번에 보내면 Enter 가 paste 의 일부로
          // 흡수돼 submit 안 됨. `-l` (literal) 로 텍스트 먼저, 200ms 지연 후
          // 별도 send-keys 로 Enter — claude 가 paste 종료 후 Enter 를 진짜
          // submit 키로 받음. 사용자 보고: "프롬프트만 입력되고 엔터 안 눌림".
          await execFileAsync(tmux, ['send-keys', '-l', '-t', session, oneLinePrompt], {
            timeout: 4000,
            env,
          })
          await new Promise<void>((resolve) => setTimeout(resolve, 250))
          await execFileAsync(tmux, ['send-keys', '-t', session, 'Enter'], {
            timeout: 4000,
            env,
          })
        } catch {
          // ignore — task prompt 주입 실패는 non-fatal (사용자가 수동 send-keys 가능)
        }
      }
    }

    return {
      teamId,
      configPath,
      worktreesCreated,
      tmuxSessionsStarted,
      council: councilEnabled || undefined,
      councilSeeded: councilEnabled ? councilSeeded : undefined,
      councilSeedErrors: councilSeedErrors.length > 0 ? councilSeedErrors : undefined,
    }
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

  /**
   * Append a message to a team member's inbox file. The watcher's
   * loadInbox/summariseInbox already reads `<teamDir>/inboxes/<member>.json`
   * — this method just writes new entries that conform to the InboxMessage
   * shape. Used for inter-member communication (Council, async hand-off).
   */
  async sendInboxMessage(
    workspacePath: string | null,
    teamId: string,
    fromAgent: string,
    toAgent: string,
    text: string,
    summary?: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (!teamId || !fromAgent || !toAgent || !text) {
      return { ok: false, error: 'teamId, fromAgent, toAgent, text are required' }
    }
    // 입력 검증 (Codex 적대 검수 high #3 fix): toAgent / fromAgent / teamId 를
    // path 에 그대로 끼우면 `../config` 같은 traversal 로 config.json 덮어쓰기
    // 가능. config 객체는 Array 가 아니므로 빈 inbox 로 취급되고 atomic rename
    // 으로 설정 파일이 메시지 배열로 교체 → 팀 파괴. 차단:
    //   1. teamId / agent 이름에 path 구분자 / `..` / null 금지
    //   2. teamId 가 실제 존재하는 team 디렉토리인지 확인
    //   3. fromAgent / toAgent 가 그 팀의 member list 또는 시스템 이름
    //      ('main', 'forge-team') 과 정확히 일치
    //   4. resolved inboxPath 가 inboxDir 안인지 containment 확인
    const SAFE = /^[A-Za-z0-9._-]+$/
    if (!SAFE.test(teamId)) {
      return { ok: false, error: `invalid teamId: ${teamId}` }
    }
    if (!SAFE.test(fromAgent) || !SAFE.test(toAgent)) {
      return { ok: false, error: 'invalid agent name (allowed: A-Z a-z 0-9 . _ -)' }
    }
    const found = await this.readConfig(workspacePath, teamId)
    if (!found) return { ok: false, error: `team not found: ${teamId}` }
    const memberNames = new Set<string>([
      ...found.config.members.map((m) => m.name),
      ...found.config.members.map((m) => m.agentId),
    ])
    const SYSTEM_NAMES = new Set(['main', 'forge-team'])
    const isValidSender = SYSTEM_NAMES.has(fromAgent) || memberNames.has(fromAgent)
    const isValidRecipient = SYSTEM_NAMES.has(toAgent) || memberNames.has(toAgent)
    if (!isValidSender) {
      return { ok: false, error: `unknown sender: ${fromAgent}` }
    }
    if (!isValidRecipient) {
      return { ok: false, error: `unknown recipient: ${toAgent}` }
    }
    const teamsDir = this.teamsDirFor(workspacePath)
    const teamDir = path.join(teamsDir, teamId)
    const inboxDir = path.join(teamDir, 'inboxes')
    const inboxPath = path.resolve(inboxDir, `${toAgent}.json`)
    // 최종 containment check (defense in depth — SAFE regex 가 ../ 차단하지만
    // OS-level symlink 경유 우회 시도 등 추가 보호)
    if (!inboxPath.startsWith(inboxDir + path.sep) && inboxPath !== path.join(inboxDir, `${toAgent}.json`)) {
      return { ok: false, error: 'resolved path outside inbox directory' }
    }
    let writeResult: { ok: boolean; error?: string }
    try {
      await fs.mkdir(inboxDir, { recursive: true })
      writeResult = await this.withInboxLock(inboxPath, async () => {
        let existing: unknown[] = []
        try {
          const buf = await fs.readFile(inboxPath, 'utf-8')
          const parsed = JSON.parse(buf)
          if (Array.isArray(parsed)) existing = parsed
        } catch {
          // first message in this inbox — leave existing as []
        }
        existing.push({
          from: fromAgent,
          text,
          summary: summary ?? text.slice(0, 120),
          timestamp: new Date().toISOString(),
          read: false,
        })
        // Atomic write: temp file + rename, so 다른 reader 가 half-written
        // JSON 을 보지 않게. 같은 inboxPath 의 RMW pair 는 락이 보호함.
        const tmpPath = `${inboxPath}.tmp-${process.pid}-${Date.now()}`
        await fs.writeFile(tmpPath, JSON.stringify(existing, null, 2), 'utf-8')
        await fs.rename(tmpPath, inboxPath)
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }

    // 실시간 push — 쓰기 성공 후 수신자 tmux pane 에 고정 알림 inject.
    // 사용자 요구: "inbox 도 좀 바로바로 알아듣게 못하나". send-keys 가
    // claude 의 input buffer 에 들어가서 현재 turn 끝나면 자동 submit →
    // 다음 turn 에서 claude 가 read-inbox 호출 → trusted file 에서 내용 읽음.
    // 시스템 seed 메시지 (from='forge-team') 는 어차피 첫 turn 에서 task
    // prompt 에 안내된 대로 읽으므로 알림 스킵 (중복 노이즈).
    if (writeResult.ok && fromAgent !== 'forge-team' && fromAgent !== toAgent) {
      void this.notifyRecipientPane(workspacePath, teamId, toAgent, fromAgent).catch(() => {
        // best-effort — pane 없거나 tmux 없어도 inbox 자체는 정상 쓰임
      })
    }
    return writeResult
  }

  /**
   * 수신자 멤버의 tmux pane 에 inbox 도착 알림을 고정 prompt 로 inject.
   *
   * Codex 적대 검수 (high #4) fix: 이전 버전은 발신자 제공 summary/text 를
   * 수신자 LLM 터미널 입력에 그대로 넣고 Enter 까지 보냄 → 한 멤버가 다른
   * 멤버에게 "기존 역할 무시하고 X 해라" 같은 prompt 를 강제 실행시키는
   * cross-agent prompt injection 경로. 발신자 제어 텍스트 제거하고 고정된
   * "inbox 확인" 명령만 inject — 실제 메시지 본문은 claude 가 trusted
   * file (.claude/teams/.../inboxes/<recipient>.json) 에서 직접 read.
   *
   * fromAgent 는 호출자가 알려준 메타 정보로만 사용 (이미 sendInboxMessage
   * 진입에서 SAFE regex + member 명부 검증 통과). 텍스트는 unchanged.
   */
  private async notifyRecipientPane(
    workspacePath: string | null,
    teamId: string,
    toAgent: string,
    fromAgent: string,
  ): Promise<void> {
    if (!(await this.hasTmux())) return
    const found = await this.readConfig(workspacePath, teamId)
    if (!found) return
    const member = found.config.members.find(
      (m) => m.name === toAgent || m.agentId === toAgent,
    )
    if (!member?.tmuxPaneId || !isTmuxPaneId(member.tmuxPaneId)) return

    // 고정 알림 — 발신자 제어 본문 0. fromAgent 만 메타로 표시 (이미 검증된
    // 멤버 명부 매칭 값이라 safe). 실제 내용은 claude 가 read-inbox 로 자체
    // 호출해서 trusted 파일에서 읽음.
    const wsArg = workspacePath ? ` --workspace "${workspacePath}"` : ''
    const notification = `📬 [inbox] ${fromAgent} 가 새 메시지 보냄 — \`forge-team read-inbox${wsArg} --team-id ${teamId} --agent ${toAgent}\` 로 자율 확인.`

    const tmux = this.tmuxBin()
    const env = {
      ...this.tmuxEnv(),
      FORGE_TEAM_ID: teamId,
      FORGE_MEMBER_NAME: toAgent,
    }
    try {
      await execFileAsync(tmux, ['send-keys', '-l', '-t', member.tmuxPaneId, notification], {
        timeout: 3000,
        env,
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
      await execFileAsync(tmux, ['send-keys', '-t', member.tmuxPaneId, 'Enter'], {
        timeout: 3000,
        env,
      })
    } catch {
      // pane 못 찾음 등 — silent
    }
  }

  /**
   * Mark all messages in a member's inbox as read. The renderer calls this
   * when the user opens the inbox panel for that member.
   */
  async markInboxRead(
    workspacePath: string | null,
    teamId: string,
    agentName: string
  ): Promise<{ ok: boolean; error?: string }> {
    // Path traversal 방어 (sendInboxMessage 와 동일)
    const SAFE = /^[A-Za-z0-9._-]+$/
    if (!SAFE.test(teamId) || !SAFE.test(agentName)) {
      return { ok: false, error: 'invalid teamId or agentName' }
    }
    const teamsDir = this.teamsDirFor(workspacePath)
    const inboxPath = path.join(teamsDir, teamId, 'inboxes', `${agentName}.json`)
    try {
      return await this.withInboxLock(inboxPath, async () => {
        let parsed: unknown
        try {
          const buf = await fs.readFile(inboxPath, 'utf-8')
          parsed = JSON.parse(buf)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true }
          throw err
        }
        if (!Array.isArray(parsed)) return { ok: true }
        const updated = parsed.map((m: { read?: boolean }) => ({ ...m, read: true }))
        const tmpPath = `${inboxPath}.tmp-${process.pid}-${Date.now()}`
        await fs.writeFile(tmpPath, JSON.stringify(updated, null, 2), 'utf-8')
        await fs.rename(tmpPath, inboxPath)
        return { ok: true }
      })
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  /**
   * 멤버 worktree 들의 변경 파일 비교 → 같은 파일 수정 alert.
   *
   * 같은 파일을 여러 멤버가 수정 중이면 머지 시 충돌 가능성. 사용자에게
   * 미리 표시. v0.8.3 minimum: 단순 git status 기반. 고도화 (라인 단위
   * overlap, semantic diff) 는 v0.9.x.
   */
  async detectMemberConflicts(
    workspacePath: string | null,
    teamId: string,
  ): Promise<Array<{ file: string; members: string[] }>> {
    const found = await this.readConfig(workspacePath, teamId)
    if (!found) return []
    const cfg = found.config
    const env = this.tmuxEnv()
    // (file → list of members touching it)
    const fileMembers = new Map<string, Set<string>>()

    for (const m of cfg.members) {
      if (!m.worktreePath) continue
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['-C', m.worktreePath, 'status', '--porcelain'],
          { timeout: 5000, env },
        )
        const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)
        for (const line of lines) {
          // porcelain v1: "XY <path>" — XY 2자리, then space, then path
          const file = line.slice(3).split(' -> ').pop() ?? ''
          const cleaned = file.replace(/^"(.*)"$/, '$1')
          if (!cleaned) continue
          if (!fileMembers.has(cleaned)) fileMembers.set(cleaned, new Set())
          fileMembers.get(cleaned)!.add(m.name)
        }
      } catch {
        // worktree 가 사라지거나 git 명령 실패 — 그 멤버 skip
      }
    }

    const conflicts: Array<{ file: string; members: string[] }> = []
    for (const [file, members] of fileMembers) {
      if (members.size > 1) {
        conflicts.push({ file, members: Array.from(members) })
      }
    }
    return conflicts
  }

  /** Read a member's inbox messages (newest first). */
  async readInbox(
    workspacePath: string | null,
    teamId: string,
    agentName: string
  ): Promise<Array<{ from: string; text: string; summary?: string; timestamp: string; read?: boolean }>> {
    // Path traversal 방어 (sendInboxMessage 와 동일)
    const SAFE = /^[A-Za-z0-9._-]+$/
    if (!SAFE.test(teamId) || !SAFE.test(agentName)) {
      return []
    }
    const teamsDir = this.teamsDirFor(workspacePath)
    const inboxPath = path.join(teamsDir, teamId, 'inboxes', `${agentName}.json`)
    try {
      const buf = await fs.readFile(inboxPath, 'utf-8')
      const parsed = JSON.parse(buf)
      if (!Array.isArray(parsed)) return []
      return parsed.slice().reverse()
    } catch {
      return []
    }
  }

  /**
   * 개별 멤버 완료 신호. 멤버 단독 호출하는 명령.
   * config 의 해당 멤버에 completedAt 만 set. 팀 전체 status 는 안 건드림.
   * **모든 멤버가 completedAt 채워지면 자동으로 team-level done 으로 transition.**
   * 단일 멤버가 빨리 호출해도 다른 멤버 작업 중이면 wait 가 안 끝남.
   *
   * Codex 적대 검수 (high #1): 기존 completeTeam 이 단일 멤버 호출만으로 즉시
   * team done 처리 → 다른 멤버 commit 전인데 main 이 merge 진행 → 데이터 손실
   * 위험. 멤버 / 팀 신호 분리로 fix.
   */
  async completeMember(
    workspacePath: string | null,
    teamId: string,
    memberName: string,
    message?: string,
  ): Promise<{ ok: boolean; teamId?: string; member?: string; completedAt?: string; teamDone?: boolean; error?: string }> {
    if (!teamId) return { ok: false, error: 'teamId required' }
    if (!memberName) return { ok: false, error: 'memberName required' }
    const found = await this.readConfig(workspacePath, teamId)
    if (!found) return { ok: false, error: 'team not found' }
    const member = found.config.members.find(
      (m) => m.name === memberName || m.agentId === memberName,
    )
    if (!member) return { ok: false, error: `member not found: ${memberName}` }
    const completedAt = new Date().toISOString()
    member.completedAt = completedAt
    if (message) member.completionMessage = message.slice(0, 200)

    // 모든 멤버 완료됐는지 — 그러면 team-level done 으로 자동 transition
    const allDone = found.config.members.every((m) => !!m.completedAt)
    if (allDone) {
      found.config.status = 'done'
    }
    await this.writeConfig(found.configPath, found.config)

    if (allDone) {
      // main inbox 에 team:done push (wait CLI 폴링용)
      const teamDir = path.dirname(found.configPath)
      const mainInboxPath = path.join(teamDir, 'inboxes', 'main.json')
      try {
        await fs.mkdir(path.dirname(mainInboxPath), { recursive: true })
        await this.withInboxLock(mainInboxPath, async () => {
          let existing: unknown[] = []
          try {
            const buf = await fs.readFile(mainInboxPath, 'utf-8')
            const parsed = JSON.parse(buf)
            if (Array.isArray(parsed)) existing = parsed
          } catch {
            // 첫 메시지
          }
          existing.push({
            from: 'forge-team',
            text: `모든 멤버 (${found.config.members.length}) 완료`,
            summary: 'team:done',
            timestamp: completedAt,
            read: false,
            kind: 'team:done',
          })
          const tmp = `${mainInboxPath}.tmp-${process.pid}-${Date.now()}`
          await fs.writeFile(tmp, JSON.stringify(existing, null, 2), 'utf-8')
          await fs.rename(tmp, mainInboxPath)
          return undefined
        })
      } catch {
        // best-effort
      }
      // 모든 멤버 완료 — 멤버 tmux 세션들을 지연 정리 (CPU/RAM 즉시 회수,
      // 호출자 멤버의 마지막 turn 은 delay 가 보장). 사용자 보고 결함 fix.
      this.scheduleTmuxCleanup(teamId, found.config.members)
    }
    return { ok: true, teamId, member: member.name, completedAt, teamDone: allDone }
  }

  /**
   * 팀 전체 강제 완료 표시 (orchestrator / GUI Close team 전용).
   * 멤버 status 무시하고 config.status = 'done' 강제. 일반 멤버는 호출하지 않음.
   * **사용자 결정 또는 모든 멤버 결과 검증 후에만 호출**.
   *
   * 호출 패턴:
   *   - 메인 세션이 모든 멤버 결과 확인 후 명시적 호출
   *   - GUI 의 "Close team" 버튼 클릭 시
   *   - 외부 자동화 (CI 등)
   */
  async completeTeam(
    workspacePath: string | null,
    teamId: string,
    message?: string,
  ): Promise<{ ok: boolean; teamId?: string; doneAt?: string; error?: string }> {
    if (!teamId) return { ok: false, error: 'teamId required' }
    const found = await this.readConfig(workspacePath, teamId)
    if (!found) return { ok: false, error: 'team not found' }
    const doneAt = new Date().toISOString()
    found.config.status = 'done'
    await this.writeConfig(found.configPath, found.config)
    // main inbox 에 완료 알림 push (wait CLI 가 폴링)
    const teamDir = path.dirname(found.configPath)
    const mainInboxPath = path.join(teamDir, 'inboxes', 'main.json')
    try {
      await fs.mkdir(path.dirname(mainInboxPath), { recursive: true })
      await this.withInboxLock(mainInboxPath, async () => {
        let existing: unknown[] = []
        try {
          const buf = await fs.readFile(mainInboxPath, 'utf-8')
          const parsed = JSON.parse(buf)
          if (Array.isArray(parsed)) existing = parsed
        } catch {
          // 첫 메시지
        }
        existing.push({
          from: 'forge-team',
          text: message ?? '팀 작업 완료',
          summary: 'team:done',
          timestamp: doneAt,
          read: false,
          kind: 'team:done',
        })
        const tmp = `${mainInboxPath}.tmp-${process.pid}-${Date.now()}`
        await fs.writeFile(tmp, JSON.stringify(existing, null, 2), 'utf-8')
        await fs.rename(tmp, mainInboxPath)
        return undefined
      })
    } catch {
      // main inbox 쓰기 실패해도 config status 는 done — wait 가 그걸로도 감지
    }
    // 강제 완료도 멤버 tmux 세션 지연 정리 (orchestrator 가 결과 검증 후 호출)
    this.scheduleTmuxCleanup(teamId, found.config.members)
    return { ok: true, teamId, doneAt }
  }

  /**
   * 팀이 완료됐는지 확인. forge-team wait 가 폴링용으로 호출.
   * done 판정:
   *   - config.status === 'done' (가장 안전한 명시적 신호)
   *   - 또는 main.json inbox 에 kind === 'team:done' 메시지 존재
   */
  async isTeamDone(
    workspacePath: string | null,
    teamId: string,
  ): Promise<{ done: boolean; doneAt?: string; reason?: string }> {
    const found = await this.readConfig(workspacePath, teamId)
    if (!found) return { done: false, reason: 'team not found' }
    if (found.config.status === 'done') {
      return { done: true, reason: 'config.status' }
    }
    // main inbox 확인
    const teamDir = path.dirname(found.configPath)
    const mainInboxPath = path.join(teamDir, 'inboxes', 'main.json')
    try {
      const buf = await fs.readFile(mainInboxPath, 'utf-8')
      const parsed = JSON.parse(buf) as Array<{ kind?: string; timestamp?: string }>
      if (Array.isArray(parsed)) {
        const doneMsg = parsed.find((m) => m.kind === 'team:done')
        if (doneMsg) return { done: true, doneAt: doneMsg.timestamp, reason: 'main inbox' }
      }
    } catch {
      // main inbox 없음 — 미완료
    }
    return { done: false }
  }

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

    // ── 부모 브랜치 back-merge (v0.13.0) ─────────────────────────────
    // 멤버 머지 결과는 team base branch (team/<id>-base) 에 쌓인다. 여기서
    // 끝내면 워크스페이스가 팀 브랜치에 남고 결과가 원래 브랜치에 없다 —
    // 팀 생성 시 기록한 parentBranch 로 통합해야 "merge = 통합 완료".
    // legacy 팀 (parentBranch 없음) 은 기존 동작 유지.
    let integratedInto: string | undefined
    const parentBranch = cfg.parentBranch
    if (parentBranch && parentBranch !== baseBranch) {
      try {
        await execFileAsync('git', ['-C', wsPath, 'checkout', parentBranch], {
          timeout: 10_000,
          env,
        })
      } catch (err) {
        return {
          ok: false,
          conflicts: [],
          error: `failed to checkout ${parentBranch}: ${(err as Error).message}`,
        }
      }
      try {
        await execFileAsync(
          'git',
          ['-C', wsPath, 'merge', '--no-ff', '-m', `team(${teamId}): ${cfg.name} 팀 결과 통합`, baseBranch],
          { timeout: 30_000, env }
        )
        integratedInto = parentBranch
      } catch (err) {
        const conflicts = await this.collectConflicts(wsPath, baseBranch, parentBranch)
        await execFileAsync('git', ['-C', wsPath, 'merge', '--abort'], {
          timeout: 5000,
          env,
        }).catch(() => {})
        return {
          ok: false,
          conflicts,
          error: `parent merge failed (${parentBranch} ← ${baseBranch}): ${(err as Error).message}`,
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

    cfg.mergedAt = new Date().toISOString()
    await this.writeConfig(found.configPath, cfg)

    // merge 성공 = 멤버 작업물이 전부 통합됨 → 잔재 (worktree/tmux/브랜치)
    // 자동 정리. 사용자 보고 결함 fix: "팀 작업 끝나도 바로 안 없어짐".
    // 기본값은 ForgeConfig.autoArchiveOnMerge — 호출자가 명시하면 그게 우선.
    let archived = false
    if (opts.autoArchive ?? loadForgeConfig().autoArchiveOnMerge) {
      const archiveRes = await this.archiveTeam(workspacePath, teamId, { force: true })
      archived = archiveRes.ok
    }

    const result: TeamMergeResult = { ok: true, mergedBranch: baseBranch }
    if (commitSha) result.commitSha = commitSha
    if (integratedInto) result.integratedInto = integratedInto
    result.archived = archived
    return result
  }

  private async workspaceDirty(wsPath: string): Promise<boolean> {
    try {
      // -uall: untracked 를 디렉토리 축약 (`?? .claude/`) 없이 개별 파일로
      // 나열 — 축약되면 forge-owned (.claude/teams/**) 필터가 매칭 못 해서
      // 팀 config 만 있는 깨끗한 워크스페이스도 dirty 로 오판한다 (v0.13.0 fix).
      const { stdout } = await execFileAsync(
        'git',
        ['-C', wsPath, 'status', '--porcelain', '-uall'],
        { timeout: 10_000, env: this.tmuxEnv() }
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

  // ── Archive (v0.13.0) ────────────────────────────────────────────────

  /**
   * 팀 리소스 정리 — tmux 세션 kill + worktree 제거 + 팀 브랜치 삭제.
   * remove() 와 달리 config.json 은 history 로 보존한다 (archivedAt 기록,
   * status='done'). GUI 는 archivedAt 으로 Active / Done 을 분리 표시.
   * 사용자 보고 결함 fix: "팀 작업 끝나도 worktree/tmux/config 잔재 남음".
   *
   * 안전 규칙:
   *   - merge 전 (mergedAt 없음) 인데 멤버 브랜치에 미통합 commit 이 있으면
   *     force 없이 거부 — 작업 유실 방지. (리뷰-only 팀처럼 commit 0 이면 통과)
   *   - team base branch 는 parentBranch 가 그 내용을 전부 포함할 때만 삭제.
   *     아니면 보존하고 keptBaseBranch 로 보고.
   */
  async archiveTeam(
    workspacePath: string | null,
    teamId: string,
    opts: { force?: boolean } = {},
  ): Promise<{
    ok: boolean
    archivedAt?: string
    tmuxKilled: number
    worktreesRemoved: number
    branchesDeleted: number
    keptBaseBranch?: string
    error?: string
  }> {
    const empty = { tmuxKilled: 0, worktreesRemoved: 0, branchesDeleted: 0 }
    if (!teamId) return { ok: false, ...empty, error: 'teamId required' }
    const found = await this.readConfig(workspacePath, teamId)
    if (!found) return { ok: false, ...empty, error: 'team not found' }
    const cfg = found.config
    const wsPath = cfg.workspacePath
    const env = this.tmuxEnv()
    const gitOk = await this.hasGit()

    // 미통합 작업 보호
    if (!cfg.mergedAt && !opts.force && gitOk && wsPath && cfg.baseBranch) {
      const unmerged: string[] = []
      for (const m of cfg.members) {
        if (!m.branch || m.branch === cfg.baseBranch) continue
        try {
          const { stdout } = await execFileAsync(
            'git',
            ['-C', wsPath, 'rev-list', '--count', `${cfg.baseBranch}..${m.branch}`],
            { timeout: 5000, env },
          )
          if (parseInt(stdout.trim(), 10) > 0) unmerged.push(m.branch)
        } catch {
          // 브랜치 이미 없음 — 정리 대상으로 진행
        }
      }
      if (unmerged.length > 0) {
        return {
          ok: false,
          ...empty,
          error: `미통합 commit 있는 브랜치: ${unmerged.join(', ')} — forge-team merge 먼저, 작업물 버리고 강제 정리는 --force`,
        }
      }
    }

    // 1. tmux 세션 kill
    let tmuxKilled = 0
    if (await this.hasTmux()) {
      const tmux = this.tmuxBin()
      for (const m of cfg.members) {
        const session = teamSessionName(teamId, m.agentId)
        const killed = await execFileAsync(tmux, ['kill-session', '-t', session], {
          timeout: 3000,
          env,
        })
          .then(() => true)
          .catch(() => false)
        if (killed) tmuxKilled++
      }
    }

    // 2. worktree 제거 + prune, 3. 브랜치 삭제
    let worktreesRemoved = 0
    let branchesDeleted = 0
    let keptBaseBranch: string | undefined
    if (gitOk && wsPath) {
      for (const m of cfg.members) {
        if (!m.worktreePath || m.worktreePath === wsPath) continue
        if (!isPathInside(wsPath, m.worktreePath)) continue
        const removed = await execFileAsync(
          'git',
          ['-C', wsPath, 'worktree', 'remove', m.worktreePath, '--force'],
          { timeout: 15_000, env },
        )
          .then(() => true)
          .catch(() => false)
        if (removed) worktreesRemoved++
      }
      await execFileAsync('git', ['-C', wsPath, 'worktree', 'prune'], {
        timeout: 10_000,
        env,
      }).catch(() => {})

      for (const m of cfg.members) {
        if (!m.branch || !m.branch.startsWith(`team/${teamId}`)) continue
        if (m.branch === cfg.baseBranch) continue
        const deleted = await execFileAsync('git', ['-C', wsPath, 'branch', '-D', m.branch], {
          timeout: 5000,
          env,
        })
          .then(() => true)
          .catch(() => false)
        if (deleted) branchesDeleted++
      }

      // team base branch — parentBranch 가 내용을 전부 포함할 때만 삭제.
      // (legacy 팀은 parentBranch 미기록 → back-merge 결과 보존 위해 유지)
      const teamBase = cfg.baseBranch
      if (teamBase) {
        let safeToDelete = false
        if (cfg.parentBranch) {
          try {
            const { stdout } = await execFileAsync(
              'git',
              ['-C', wsPath, 'rev-list', '--count', `${cfg.parentBranch}..${teamBase}`],
              { timeout: 5000, env },
            )
            safeToDelete = parseInt(stdout.trim(), 10) === 0
          } catch {
            safeToDelete = false
          }
        }
        if (safeToDelete) {
          const deleted = await execFileAsync('git', ['-C', wsPath, 'branch', '-D', teamBase], {
            timeout: 5000,
            env,
          })
            .then(() => true)
            .catch(() => false)
          if (deleted) branchesDeleted++
          else keptBaseBranch = teamBase
        } else {
          keptBaseBranch = teamBase
        }
      }
    }

    const archivedAt = new Date().toISOString()
    cfg.status = 'done'
    cfg.archivedAt = archivedAt
    await this.writeConfig(found.configPath, cfg)
    return { ok: true, archivedAt, tmuxKilled, worktreesRemoved, branchesDeleted, keptBaseBranch }
  }

  /**
   * 모든 멤버 완료 후 멤버 tmux 세션 지연 정리. complete-member 는 멤버
   * 자신의 pane 안에서 호출되므로 즉시 kill 하면 호출자 claude 가 마지막
   * turn 을 못 끝냄 — detached 프로세스가 delaySec 뒤에 kill (CLI 프로세스
   * 종료 후에도 살아남음). worktree/브랜치는 merge → archive 가 처리.
   */
  private scheduleTmuxCleanup(teamId: string, members: RawMember[], delaySec?: number): void {
    const delay = delaySec ?? loadForgeConfig().tmuxCleanupDelaySec
    const sessions = members.map((m) => teamSessionName(teamId, m.agentId))
    if (sessions.length === 0) return
    const tmux = this.tmuxBin()
    const cmds = sessions.map((s) => `"${tmux}" kill-session -t "${s}" 2>/dev/null`).join('; ')
    try {
      const child = spawn('/bin/sh', ['-c', `sleep ${delay}; ${cmds}; exit 0`], {
        detached: true,
        stdio: 'ignore',
        env: this.tmuxEnv(),
      })
      child.unref()
    } catch {
      // best-effort — 실패해도 merge → archive 가 결국 정리
    }
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
