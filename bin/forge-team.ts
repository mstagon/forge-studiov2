#!/usr/bin/env node
/**
 * forge-team — headless CLI bridge for the Forge Studio team registry.
 *
 * Lets the main Claude Code session (which has no IPC channel into a running
 * Electron GUI) provision exactly the same on-disk state the GUI's
 * AgentTeamWatcher would produce: per-team config.json under
 * `<workspace>/.claude/teams/<teamId>/`, isolated git worktrees, optional
 * tmux sessions. When the GUI is running it discovers the new team via its
 * own chokidar watcher — so this CLI is consciously *write-only* with respect
 * to runtime IPC.
 *
 * Implementation note: imports `TeamOperations` directly. PathManager is
 * skipped because it depends on `electron`; the CLI falls back to system
 * `tmux` on PATH. If you launch this from inside the packaged Forge.app and
 * want the bundled tmux, prepend `<Forge.app>/Contents/Resources/bundled-tools/bin`
 * to your PATH manually before invoking.
 */

import path from 'path'
import { TeamOperations } from '../electron/services/TeamOperations.ts'
import { loadForgeConfig } from '../electron/services/ForgeConfig.ts'
import { GauntletRunner } from '../electron/services/GauntletRunner.ts'
import { FactoryRunner, type FactoryJob } from '../electron/services/FactoryRunner.ts'
import { FlightRecorder } from '../electron/services/FlightRecorder.ts'
import type {
  TeamCreateMember,
  WorktreeStrategy,
  MergeStrategy,
} from '../electron/services/TeamOperations.ts'

// Pure system fallbacks — no electron, no PathManager. Callers running inside
// Forge.app can override PATH externally to pick up the bundled tmux.
const ops = new TeamOperations({
  tmuxBin: () => 'tmux',
  tmuxEnv: () => ({ ...process.env }),
})

interface ParsedArgs {
  command: string
  flags: Map<string, string>
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv
  const flags = new Map<string, string>()
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]
    if (!tok.startsWith('--')) continue
    const key = tok.slice(2)
    const next = rest[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next)
      i++
    } else {
      flags.set(key, 'true')
    }
  }
  return { command: command ?? '', flags }
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const v = flags.get(name)
  if (!v) {
    fail(`missing required flag: --${name}`)
  }
  return v as string
}

function emit(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

function fail(msg: string, code = 1): never {
  process.stderr.write(`forge-team: ${msg}\n`)
  process.exit(code)
}

/**
 * Members syntax (CLI-friendly, JSON-friendly, both supported):
 *   --members "agentId1:task1,agentId2:task2"
 *   --members '[{"agentId":"x","task":"y"}, ...]'
 *
 * Commas inside tasks aren't supported in the simple form; switch to JSON
 * if a task description contains a comma.
 */
function parseMembers(raw: string): TeamCreateMember[] {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (!Array.isArray(arr)) throw new Error('expected JSON array')
      // v0.9.9 — model / role / expectedFiles 도 보존. 옛 코드는 agentId/task
      // 만 보존해서 boundary guard + ProviderRouter 분기가 무력화됐음 (Codex
      // 검수에서 발견). TeamOperations.create() 가 이미 이 필드들을 RawMember
      // 에 propagate + autoStart prompt 에 inject 한다.
      return arr.map((m: TeamCreateMember) => ({
        agentId: String(m.agentId),
        task: m.task ? String(m.task) : undefined,
        model: m.model ? String(m.model) : undefined,
        role: m.role ? String(m.role) : undefined,
        expectedFiles: Array.isArray(m.expectedFiles) ? m.expectedFiles.map(String) : undefined,
      }))
    } catch (err) {
      fail(`--members JSON parse failed: ${(err as Error).message}`)
    }
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const colonIdx = entry.indexOf(':')
      if (colonIdx < 0) return { agentId: entry }
      return {
        agentId: entry.slice(0, colonIdx).trim(),
        task: entry.slice(colonIdx + 1).trim() || undefined,
      }
    })
}

function asWorktreeStrategy(v: string | undefined): WorktreeStrategy {
  if (v === 'isolated' || v === 'shared') return v
  if (v === undefined) return 'isolated'
  fail(`--worktree-strategy must be 'isolated' or 'shared' (got: ${v})`)
}

function asMergeStrategy(v: string | undefined): MergeStrategy {
  if (v === 'squash' || v === 'sequential') return v
  if (v === undefined) return 'squash'
  fail(`--merge-strategy must be 'squash' or 'sequential' (got: ${v})`)
}

function resolveWorkspace(flags: Map<string, string>): string {
  const ws = flags.get('workspace')
  if (!ws) fail('missing required flag: --workspace')
  return path.resolve(ws as string)
}

async function cmdCreate(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const name = requireFlag(flags, 'name')
  const goal = flags.get('goal')
  const membersRaw = requireFlag(flags, 'members')
  const members = parseMembers(membersRaw)
  if (members.length === 0) fail('--members must list at least one entry')

  // v0.13.0 — 1인팀 가드. 메인 세션이 phase 마다 단일 멤버 팀을 연속 생성해
  // worktree/tmux 가 누적되는 패턴 차단 (사용자 보고 결함). 정말 단일 멤버가
  // 필요하면 --solo 명시. ForgeConfig.soloTeamGuard=false 로 가드 끌 수 있음.
  const forgeCfg = loadForgeConfig()
  if (members.length === 1 && forgeCfg.soloTeamGuard && flags.get('solo') !== 'true') {
    fail(
      '1인팀 거부: 단일 멤버 팀의 연속 생성은 worktree/tmux 누적 낭비. ' +
        '대기 중인 다른 작업과 묶어 멀티 멤버 한 팀으로 만들거나, ' +
        '정말 단일 멤버가 필요하면 --solo 를 명시하라.',
      4
    )
  }

  // v0.13.0 — 활성 팀 누적 경고. 끝난 팀 정리 없이 계속 만드는 패턴 감지.
  try {
    const existing = await ops.list(workspacePath)
    const active = existing.filter((t) => t.status !== 'done' && !t.archivedAt)
    if (active.length >= forgeCfg.activeTeamWarnThreshold) {
      process.stderr.write(
        `forge-team: ⚠️ 활성 팀이 이미 ${active.length}개 (${active
          .map((t) => t.id)
          .join(', ')}) — 끝난 팀은 merge(자동 archive) 또는 archive 후 새 팀을 만들 것.\n`
      )
    }
  } catch {
    // 목록 조회 실패는 create 를 막지 않음
  }
  const worktreeStrategy = asWorktreeStrategy(flags.get('worktree-strategy'))
  const mergeStrategy = asMergeStrategy(flags.get('merge-strategy'))
  const workspaceId = flags.get('workspace-id') ?? path.basename(workspacePath)
  // Default to NOT auto-running `claude` from the headless CLI — the main
  // session is the orchestrator and probably wants to wire the prompt itself.
  // Pass --auto-start to opt in.
  const autoStartClaude = flags.get('auto-start') === 'true'
  const council = flags.get('council') === 'true'

  const result = await ops.create({
    workspaceId,
    workspacePath,
    name,
    goal,
    members,
    worktreeStrategy,
    mergeStrategy,
    autoStartClaude,
    council,
  })
  emit(result)
}

async function cmdList(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teams = await ops.list(workspacePath)
  emit(teams)
}

async function cmdRemove(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  await ops.remove(workspacePath, teamId)
  emit({ ok: true, teamId })
}

async function cmdMerge(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const strategyFlag = flags.get('merge-strategy')
  const result = await ops.merge(workspacePath, teamId, {
    ...(strategyFlag ? { mergeStrategy: asMergeStrategy(strategyFlag) } : {}),
    // 기본: merge 성공 시 worktree/tmux/브랜치 자동 archive. --no-archive 로 옵트아웃.
    autoArchive: flags.get('no-archive') !== 'true',
  })
  emit(result)
  if (!result.ok) process.exit(2)
}

async function cmdArchive(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const force = flags.get('force') === 'true'
  const result = await ops.archiveTeam(workspacePath, teamId, { force })
  emit(result)
  if (!result.ok) process.exit(2)
}

// ────────────────────────────────────────────────────────────────────
// factory — Night Shift 자율 공장 (계약 큐 → 생산 → Gauntlet 게이트 → 머지)
// ────────────────────────────────────────────────────────────────────

const factory = new FactoryRunner(ops)

async function cmdFactory(flags: Map<string, string>, sub: string): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  switch (sub) {
    case 'add': {
      // --id <id> --goal "<목표>" --members <spec> [--contract <path>] [--depends a,b]
      const id = requireFlag(flags, 'id')
      const goal = requireFlag(flags, 'goal')
      const members = parseMembers(requireFlag(flags, 'members'))
      if (members.length === 0) fail('--members 최소 1개')
      const contract = flags.get('contract')
      const dependsOn = flags.get('depends')?.split(',').map((s) => s.trim()).filter(Boolean)
      const job = await factory.addJob(workspacePath, { id, goal, members, contract, dependsOn })
      emit({ ok: true, added: job.id })
      break
    }
    case 'list':
    case 'status': {
      const queue = await factory.loadQueue(workspacePath)
      emit({
        jobs: queue.jobs.map((j: FactoryJob) => ({
          id: j.id,
          status: j.status,
          goal: j.goal,
          dependsOn: j.dependsOn ?? [],
          blockerCount: j.blockerCount,
          note: j.note,
        })),
      })
      break
    }
    case 'run': {
      const dateStamp = flags.get('date') ?? new Date().toISOString().slice(0, 10)
      const judges = flags.get('judges')?.split(',').map((s) => s.trim()).filter(Boolean)
      const jobTimeoutMs = flags.get('job-timeout') ? parseInt(flags.get('job-timeout')!, 10) : 0
      const result = await factory.run({
        workspacePath,
        dateStamp,
        judges,
        jobTimeoutMs,
        env: { ...process.env },
      })
      emit(result)
      if (result.failed.length > 0) process.exit(3)
      break
    }
    default:
      fail(`unknown factory subcommand: ${sub} (add|list|status|run)`)
  }
}

// ────────────────────────────────────────────────────────────────────
// recorder — Flight Recorder (타임라인 기록/조회 + 시점 분기)
// ────────────────────────────────────────────────────────────────────

const recorder = new FlightRecorder(ops)

async function cmdRecorder(flags: Map<string, string>, sub: string): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  switch (sub) {
    case 'capture': {
      const teamId = requireFlag(flags, 'team-id')
      const r = await recorder.capturePanes(workspacePath, teamId, { ...process.env })
      emit({ ok: true, ...r })
      break
    }
    case 'timeline': {
      const teamId = requireFlag(flags, 'team-id')
      const limit = flags.get('limit') ? parseInt(flags.get('limit')!, 10) : 200
      const events = await recorder.timeline(workspacePath, teamId, { limit, env: { ...process.env } })
      emit({ teamId, count: events.length, events })
      break
    }
    case 'fork': {
      const teamId = requireFlag(flags, 'team-id')
      const atCommit = requireFlag(flags, 'at')
      const asAgent = requireFlag(flags, 'as')
      const r = await recorder.fork(workspacePath, { teamId, atCommit, asAgent, env: { ...process.env } })
      emit(r)
      if (!r.ok) process.exit(2)
      break
    }
    default:
      fail(`unknown recorder subcommand: ${sub} (capture|timeline|fork)`)
  }
}

async function cmdGauntlet(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const range = flags.get('range') ?? 'HEAD~1..HEAD'
  // 심판: --judges 우선, 없으면 ForgeConfig.gauntletJudges (cross-provider 기본)
  const judgesFlag = flags.get('judges')
  const judgeModels = judgesFlag
    ? judgesFlag.split(',').map((s) => s.trim()).filter(Boolean)
    : loadForgeConfig().gauntletJudges
  const runner = new GauntletRunner()
  const verdict = await runner.run({
    workspacePath,
    range,
    judges: judgeModels.map((model) => ({ model })),
    env: { ...process.env },
  })
  emit({
    range: verdict.range,
    blockerCount: verdict.blockerCount,
    consensus: verdict.consensus.length,
    solo: verdict.solo.length,
    judges: verdict.judges.map((j) => ({ model: j.model, ok: j.ok, clean: j.clean, findings: j.findings.length })),
    reportPath: verdict.reportPath,
    jsonPath: verdict.jsonPath,
  })
  // CI 게이트: blocker 있으면 exit 3
  if (verdict.blockerCount > 0) process.exit(3)
}

async function cmdPause(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const agentId = flags.get('agent-id')
  const result = agentId
    ? await ops.pauseMember(workspacePath, teamId, agentId)
    : await ops.pause(workspacePath, teamId)
  emit(result)
}

// ────────────────────────────────────────────────────────────────────
// plan / execute — phase 별 sequential team orchestration
// ────────────────────────────────────────────────────────────────────

interface PlanPhase {
  /** Phase 인덱스 (1부터). */
  phase: number
  /** Phase 의 한 줄 설명 (한국어 OK). */
  description: string
  /** 같은 phase 안의 멤버는 병렬 실행 (worktree 격리). */
  parallel: boolean
  /** 멤버 구성. forge-team create 의 --members 와 동일 shape. */
  members: TeamCreateMember[]
  /** 의존성 (다른 phase 인덱스 list). */
  dependsOn?: number[]
  /** Council 적용 여부 (v0.7.1+). */
  council?: boolean
}

interface PlanDocument {
  goal: string
  workspaceId: string
  phases: PlanPhase[]
  /** v0.7.0 시점에는 사용자가 직접 채우거나 planner agent 가 출력. */
  notes?: string
}

/**
 * forge-team plan — goal 을 받아서 plan.json template 출력.
 * v0.7.0: hardcoded sensible default phases (prisma → nestjs → flutter+cms 병렬).
 *         사용자가 출력 받고 수정해서 execute 에 넘김.
 * v0.7.1: planner agent (Council) 가 동적으로 plan 생성.
 */
async function cmdPlan(flags: Map<string, string>): Promise<void> {
  const goal = requireFlag(flags, 'goal')
  const workspacePath = requireFlag(flags, 'workspace')
  const workspaceId = flags.get('workspace-id') || path.basename(path.resolve(workspacePath))

  // Default template — 풀스택 피처 (DB → API → UI 병렬 → 통합 테스트)
  const plan: PlanDocument = {
    goal,
    workspaceId,
    phases: [
      {
        phase: 1,
        description: '스키마 + 마이그레이션 (Prisma)',
        parallel: false,
        members: [{ agentId: 'prisma-data', task: `${goal} 의 스키마 + 마이그레이션`, model: 'gpt-5.5' }],
      },
      {
        phase: 2,
        description: 'API + 비즈니스 로직 (NestJS)',
        parallel: false,
        dependsOn: [1],
        members: [{ agentId: 'nestjs-backend', task: `${goal} API`, model: 'claude-opus-4-7' }],
      },
      {
        phase: 3,
        description: 'UI + 상태관리 (Flutter, 병렬)',
        parallel: true,
        dependsOn: [2],
        members: [
          { agentId: 'flutter-ui', task: `${goal} 화면`, model: 'claude-opus-4-7' },
          { agentId: 'riverpod-logic', task: `${goal} 상태관리`, model: 'claude-opus-4-7' },
          { agentId: 'dio-retrofit', task: `${goal} API 클라이언트`, model: 'claude-opus-4-7' },
        ],
      },
      {
        phase: 4,
        description: '통합 테스트 + 코드 리뷰',
        parallel: true,
        dependsOn: [3],
        members: [
          { agentId: 'test-writer', task: `${goal} e2e 테스트`, model: 'claude-opus-4-7' },
          { agentId: 'code-reviewer', task: 'diff 리뷰', model: 'claude-opus-4-7' },
          { agentId: 'security-auditor', task: 'OWASP 점검', model: 'gpt-5.5' },
          { agentId: 'spec-verifier', task: '스펙 정합성', model: 'gpt-5.5' },
        ],
      },
    ],
    notes:
      'v0.7.0 template. 멤버 task 채우고 execute 로 phase 별 sequential. ' +
      '같은 phase 안 멤버는 worktree 격리되어 병렬 안전. dependsOn 순서대로 자동 진행.',
  }

  emit(plan)
}

/**
 * forge-team execute — plan.json 의 한 phase 만 실행.
 *   --plan <file>     plan JSON 파일
 *   --phase <n>       실행할 phase (없으면 첫 미완료 phase 추론은 v0.7.1)
 *   --merge           phase 완료 후 자동 merge (모든 멤버 done 가정)
 *
 * v0.7.0: 단일 phase 만 실행. phase 의 모든 멤버를 forge-team create 로 spawn.
 *         완료 자동 감지는 v0.7.1+ (멤버가 inbox 'task_complete' 보내는 패턴).
 *         사용자가 모든 멤버 끝나면 --merge 다시 호출.
 */
async function cmdExecute(flags: Map<string, string>): Promise<void> {
  const planFile = requireFlag(flags, 'plan')
  const workspacePath = requireFlag(flags, 'workspace')
  const phaseArg = flags.get('phase')
  const merge = flags.get('merge') === 'true'

  const fs = await import('fs/promises')
  let plan: PlanDocument
  try {
    const buf = await fs.readFile(planFile, 'utf-8')
    plan = JSON.parse(buf) as PlanDocument
  } catch (err) {
    fail(`plan 파일 읽기 실패: ${(err as Error).message}`)
  }

  if (!phaseArg) {
    fail('--phase <n> 필요. 첫 phase 부터 sequential 자동 실행은 v0.7.1+')
  }
  const phaseNum = parseInt(phaseArg, 10)
  if (isNaN(phaseNum)) fail(`--phase 는 숫자여야: ${phaseArg}`)

  const phase = plan.phases.find((p) => p.phase === phaseNum)
  if (!phase) fail(`phase ${phaseNum} 없음 (plan 의 phases: ${plan.phases.map((p) => p.phase).join(', ')})`)

  if (merge) {
    // Caller signals phase 완료 — base branch 로 merge 시도
    // 다만 plan 의 phase 자체가 한 팀 ≠ 한 phase 라 — 사용자가 team-id 명시 필요
    const teamId = requireFlag(flags, 'team-id')
    const result = await ops.merge(workspacePath, teamId, {
      mergeStrategy: (flags.get('merge-strategy') as MergeStrategy | undefined) ?? 'squash',
    })
    emit({ phase: phaseNum, ...result })
    if (!result.ok) process.exit(2)
    return
  }

  // Spawn — phase 의 모든 멤버를 한 forge-team create 로
  const teamName = `${plan.goal.slice(0, 24)}-phase${phaseNum}`
  const result = await ops.create({
    workspaceId: plan.workspaceId,
    workspacePath,
    name: teamName,
    goal: phase.description,
    members: phase.members,
    worktreeStrategy: (flags.get('worktree-strategy') as WorktreeStrategy | undefined) ?? 'isolated',
    mergeStrategy: (flags.get('merge-strategy') as MergeStrategy | undefined) ?? 'squash',
    autoStartClaude: flags.get('no-auto-start') !== 'true',
    council: phase.council === true,
  })
  emit({ phase: phaseNum, ...result, instructions: `완료 후 \`forge-team execute --plan ${planFile} --phase ${phaseNum} --team-id ${result.teamId} --merge\`` })
}

async function cmdResume(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const agentId = flags.get('agent-id')
  const result = agentId
    ? await ops.resumeMember(workspacePath, teamId, agentId)
    : await ops.resume(workspacePath, teamId)
  emit(result)
}

// ────────────────────────────────────────────────────────────────────
// inbox — 멤버 ↔ 멤버 ↔ 메인 메시지 (협의 모드 round-robin 의 채널)
// ────────────────────────────────────────────────────────────────────

async function cmdSendMessage(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const from = requireFlag(flags, 'from')
  const to = requireFlag(flags, 'to')
  const text = requireFlag(flags, 'text')
  const summary = flags.get('summary')
  const result = await ops.sendInboxMessage(workspacePath, teamId, from, to, text, summary)
  emit(result)
  if (!result.ok) process.exit(2)
}

async function cmdReadInbox(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const agent = requireFlag(flags, 'agent')
  const messages = await ops.readInbox(workspacePath, teamId, agent)
  emit({ agent, count: messages.length, messages })
}

async function cmdMarkInboxRead(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const agent = requireFlag(flags, 'agent')
  const result = await ops.markInboxRead(workspacePath, teamId, agent)
  emit(result)
  if (!result.ok) process.exit(2)
}

// ────────────────────────────────────────────────────────────────────
// complete / wait — 팀 완료 시그널링 + 메인 세션 대기
// ────────────────────────────────────────────────────────────────────

async function cmdComplete(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const message = flags.get('message') ?? '팀 작업 완료'
  const result = await ops.completeTeam(workspacePath, teamId, message)
  emit(result)
  if (!result.ok) process.exit(2)
}

async function cmdCompleteMember(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const agent = requireFlag(flags, 'agent')
  const message = flags.get('message')
  const result = await ops.completeMember(workspacePath, teamId, agent, message)
  emit(result)
  if (!result.ok) process.exit(2)
}

async function cmdWait(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const intervalMs = parseInt(flags.get('interval') ?? '3000', 10)
  const timeoutMs = parseInt(flags.get('timeout') ?? '0', 10) // 0 = 무제한
  const start = Date.now()
  while (true) {
    const done = await ops.isTeamDone(workspacePath, teamId)
    if (done.done) {
      emit({ ok: true, teamId, doneAt: done.doneAt, reason: done.reason })
      return
    }
    if (timeoutMs > 0 && Date.now() - start > timeoutMs) {
      emit({ ok: false, teamId, error: 'timeout', elapsedMs: Date.now() - start })
      process.exit(3)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      'forge-team — headless team registry for Forge Studio',
      '',
      'Usage:',
      '  forge-team <command> [flags]',
      '',
      'Commands:',
      '  create   Provision a new team (worktrees + tmux + config.json)',
      '           멤버 1명이면 거부 (--solo 로 명시 허용). 활성 팀 3개+ 경고.',
      '  list     List teams under a workspace (archivedAt/mergedAt 포함)',
      '  remove   Tear down a team (worktrees + tmux + branches + config)',
      '  merge    멤버 브랜치 → team base → 부모 브랜치 통합 + 자동 archive',
      '           (--no-archive 로 정리 옵트아웃)',
      '  archive  worktree/tmux/브랜치 정리, config 는 history 보존',
      '           (미통합 commit 있으면 거부 — --force 로 강제)',
      '  gauntlet cross-provider 적대 심판 — diff 를 claude+codex 가 검수',
      '           --range <git range> [--judges m1,m2]. blocker 시 exit 3',
      '  factory  Night Shift 자율 공장 (계약 큐 → 생산 → Gauntlet 게이트 → 머지)',
      '    add    --id <id> --goal "..." --members <spec> [--contract p] [--depends a,b]',
      '    list   큐 + 각 job 상태',
      '    run    큐 자율 실행 [--judges m1,m2] [--job-timeout ms] → 아침 브리핑',
      '  recorder Flight Recorder — 작업 타임라인 기록/조회 + 시점 분기',
      '    timeline --team-id <id> [--limit n]  통합 이벤트 스트림',
      '    capture  --team-id <id>              멤버 pane 출력 스냅샷',
      '    fork     --team-id <id> --at <sha> --as <agent>  과거 시점 분기',
      '  pause    Pause an entire team or a single member (--agent-id)',
      '  resume   Resume an entire team or a single member (--agent-id)',
      '  plan     goal → phase 별 plan.json template 출력 (v0.7.0+)',
      '  execute  plan.json 의 단일 phase 실행 (--phase n) 또는 머지 (--merge)',
      '  send-message       inbox 로 메시지 전달 (협의 모드 멤버끼리 통신)',
      '  read-inbox         자기 inbox 의 메시지 읽기 (newest first)',
      '  mark-inbox-read    자기 inbox 의 모든 메시지를 read=true 로',
      '  complete           팀 작업 완료 표시 (status=done) — macOS 알림 + 메인 inbox push',
      '  wait               팀 완료까지 폴링 대기 (main 세션이 호출, exit 0 = done)',
      '',
      'Common flags:',
      '  --workspace <path>          Workspace root (required)',
      '  --team-id <id>              Existing team id (required for ops)',
      '',
      'create flags:',
      '  --name <text>               Team display name (required)',
      '  --goal <text>               Team goal / description',
      '  --members <spec>            "agentId:task,agentId:task" or JSON array',
      '  --worktree-strategy         isolated (default) | shared',
      '  --merge-strategy            squash (default) | sequential',
      '  --workspace-id <id>         Override workspace id (default: dir name)',
      '  --auto-start                Auto-run `claude` inside each tmux pane',
      '  --council                   협의 모드 (멤버끼리 inbox 로 round-robin 토론)',
      '  --solo                      단일 멤버 팀 명시 허용 (기본 거부)',
      '',
      'merge flags:',
      '  --merge-strategy            squash | sequential (overrides team default)',
      '  --no-archive                merge 후 자동 archive 끄기',
      '',
      'archive flags:',
      '  --force                     미통합 commit 무시하고 강제 정리',
      '',
      'pause/resume flags:',
      '  --agent-id <id>             Pause/resume just this member',
      '',
      'inbox flags:',
      '  send-message:  --from <agent> --to <agent> --text "..." [--summary "..."]',
      '  read-inbox / mark-inbox-read:  --agent <agentName>',
      '',
      'Examples:',
      '  forge-team create --workspace . --name auth --goal "OAuth" \\',
      '    --members "nestjs-backend:auth API,flutter-ui:로그인 화면"',
      '  forge-team list --workspace .',
      '  forge-team merge --workspace . --team-id team-1234',
      '  forge-team send-message --workspace . --team-id team-1234 \\',
      '    --from flutter-ui --to nestjs-backend --text "DTO 추가 요청"',
      '  forge-team read-inbox --workspace . --team-id team-1234 --agent flutter-ui',
      '  forge-team remove --workspace . --team-id team-1234',
      '',
    ].join('\n')
  )
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
    printHelp()
    return
  }
  const { command, flags } = parseArgs(argv)
  try {
    switch (command) {
      case 'create':
        await cmdCreate(flags)
        break
      case 'list':
        await cmdList(flags)
        break
      case 'remove':
      case 'rm':
      case 'delete':
        await cmdRemove(flags)
        break
      case 'merge':
        await cmdMerge(flags)
        break
      case 'archive':
        await cmdArchive(flags)
        break
      case 'gauntlet':
      case 'judge':
        await cmdGauntlet(flags)
        break
      case 'factory': {
        // 두 번째 위치 인자가 서브명령 (add/list/status/run)
        const sub = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'list'
        await cmdFactory(flags, sub)
        break
      }
      case 'recorder': {
        const sub = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'timeline'
        await cmdRecorder(flags, sub)
        break
      }
      case 'pause':
        await cmdPause(flags)
        break
      case 'resume':
        await cmdResume(flags)
        break
      case 'plan':
        await cmdPlan(flags)
        break
      case 'execute':
      case 'run':
        await cmdExecute(flags)
        break
      case 'send-message':
        await cmdSendMessage(flags)
        break
      case 'read-inbox':
        await cmdReadInbox(flags)
        break
      case 'mark-inbox-read':
        await cmdMarkInboxRead(flags)
        break
      case 'complete':
      case 'done':
        await cmdComplete(flags)
        break
      case 'complete-member':
      case 'member-done':
        await cmdCompleteMember(flags)
        break
      case 'wait':
        await cmdWait(flags)
        break
      default:
        fail(`unknown command: ${command} (try \`forge-team help\`)`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    fail(msg)
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  fail(msg)
})
