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
  const opts = strategyFlag ? { mergeStrategy: asMergeStrategy(strategyFlag) } : {}
  const result = await ops.merge(workspacePath, teamId, opts)
  emit(result)
  if (!result.ok) process.exit(2)
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
      '  list     List teams under a workspace',
      '  remove   Tear down a team (worktrees + tmux + branches + config)',
      '  merge    Merge member branches back into the team base branch',
      '  pause    Pause an entire team or a single member (--agent-id)',
      '  resume   Resume an entire team or a single member (--agent-id)',
      '  plan     goal → phase 별 plan.json template 출력 (v0.7.0+)',
      '  execute  plan.json 의 단일 phase 실행 (--phase n) 또는 머지 (--merge)',
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
      '',
      'merge flags:',
      '  --merge-strategy            squash | sequential (overrides team default)',
      '',
      'pause/resume flags:',
      '  --agent-id <id>             Pause/resume just this member',
      '',
      'Examples:',
      '  forge-team create --workspace . --name auth --goal "OAuth" \\',
      '    --members "nestjs-backend:auth API,flutter-ui:로그인 화면"',
      '  forge-team list --workspace .',
      '  forge-team merge --workspace . --team-id team-1234',
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
