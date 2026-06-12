import path from 'path'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { TeamOperations, type TeamCreateMember } from './TeamOperations.ts'
import { GauntletRunner } from './GauntletRunner.ts'
import { syncNote } from './VaultSync.ts'

const execFileAsync = promisify(execFile)

/**
 * FactoryRunner — Night Shift (v0.20). "자는 동안 도는 공장."
 *
 * 계약 큐를 의존성 순으로 자율 실행:
 *   pending job → forge-team 생산 → 모든 멤버 완료 대기 → **머지 전 Gauntlet
 *   게이트** (멤버 브랜치를 적대 심판) → blocker 없으면 머지(+archive)·done,
 *   blocker 있으면 머지 안 하고 worktree 보존·blocked (사람 검토 대기).
 * 끝나면 아침 브리핑 (md + Obsidian 볼트 미러) 생성.
 *
 * 설계 원칙 (구독 랩핑 제약):
 *   - **순차** 실행 — 동시 다발 spawn 은 구독 5시간 한도를 버스트로 태움.
 *   - rate_limit 감지 시 일시정지 후 백오프 재개 (Gauntlet 이 자체 재시도).
 *   - **머지 전 검수** — 검수 안 된 AI 코드가 부모 브랜치에 자동 유입되지 않음.
 */

export type JobStatus = 'pending' | 'running' | 'done' | 'blocked' | 'failed' | 'skipped'

export interface FactoryJob {
  id: string
  goal: string
  /** contracts/<x>.contract.md 경로 (선택 — 멤버 prompt 에 참조 주입). */
  contract?: string
  members: TeamCreateMember[]
  /** 완료돼야 시작 가능한 다른 job id 들. */
  dependsOn?: string[]
  status: JobStatus
  teamId?: string
  gauntletReport?: string
  blockerCount?: number
  note?: string
  startedAt?: string
  finishedAt?: string
}

export interface FactoryQueue {
  jobs: FactoryJob[]
}

export interface FactoryRunResult {
  done: string[]
  blocked: string[]
  failed: string[]
  skipped: string[]
  briefingPath: string
  haltedReason?: string
}

export interface FactoryRunOptions {
  workspacePath: string
  /** 멤버 완료 폴링 간격 (ms). */
  pollMs?: number
  /** 한 job 의 멤버 완료 대기 최대 시간 (ms). 0 = 무제한. */
  jobTimeoutMs?: number
  /** Gauntlet 심판 모델. 없으면 ForgeConfig.gauntletJudges. */
  judges?: string[]
  env?: NodeJS.ProcessEnv
  /** 날짜 스탬프 (테스트 주입용 — 미지정 시 호출자가 채움). */
  dateStamp: string
}

export class FactoryRunner {
  private readonly ops: TeamOperations
  private readonly gauntlet: GauntletRunner

  // NOTE: parameter property (constructor(private readonly ops...)) 는 Node 의
  // --experimental-strip-types (strip-only) 에서 미지원 — 패키징 CLI 가 런타임에
  // 깨진다. 명시 필드 할당으로.
  constructor(ops: TeamOperations, gauntlet: GauntletRunner = new GauntletRunner()) {
    this.ops = ops
    this.gauntlet = gauntlet
  }

  private queuePath(workspacePath: string): string {
    return path.join(workspacePath, '.claude', 'factory', 'queue.json')
  }

  async loadQueue(workspacePath: string): Promise<FactoryQueue> {
    try {
      const raw = await fs.readFile(this.queuePath(workspacePath), 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.jobs)) return parsed as FactoryQueue
    } catch {
      // 없음 — 빈 큐
    }
    return { jobs: [] }
  }

  async saveQueue(workspacePath: string, queue: FactoryQueue): Promise<void> {
    const file = this.queuePath(workspacePath)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    await fs.writeFile(tmp, JSON.stringify(queue, null, 2) + '\n', 'utf-8')
    await fs.rename(tmp, file)
  }

  async addJob(
    workspacePath: string,
    job: Omit<FactoryJob, 'status'> & { status?: JobStatus },
  ): Promise<FactoryJob> {
    const queue = await this.loadQueue(workspacePath)
    if (queue.jobs.some((j) => j.id === job.id)) {
      throw new Error(`job id 중복: ${job.id}`)
    }
    const full: FactoryJob = { ...job, status: job.status ?? 'pending' }
    queue.jobs.push(full)
    await this.saveQueue(workspacePath, queue)
    return full
  }

  /** 의존성을 고려해 다음 실행 가능한 pending job (없으면 null). */
  private nextRunnable(queue: FactoryQueue): FactoryJob | null {
    const doneIds = new Set(queue.jobs.filter((j) => j.status === 'done').map((j) => j.id))
    for (const j of queue.jobs) {
      if (j.status !== 'pending') continue
      const deps = j.dependsOn ?? []
      if (deps.every((d) => doneIds.has(d))) return j
    }
    return null
  }

  /**
   * 큐 자율 실행. 반환 시 큐의 모든 job 이 종결 상태 (done/blocked/failed/skipped)
   * 거나 더 진행 불가 (의존성 막힘).
   */
  async run(opts: FactoryRunOptions): Promise<FactoryRunResult> {
    const ws = opts.workspacePath
    const env = opts.env ?? process.env
    const pollMs = opts.pollMs ?? 5000
    let haltedReason: string | undefined

    for (;;) {
      const queue = await this.loadQueue(ws)
      const job = this.nextRunnable(queue)
      if (!job) break

      job.status = 'running'
      job.startedAt = new Date().toISOString()
      await this.saveQueue(ws, queue)

      try {
        await this.runJob(ws, job, opts, env, pollMs)
      } catch (err) {
        job.status = 'failed'
        job.note = (err as Error).message.slice(0, 300)
      }
      job.finishedAt = new Date().toISOString()
      // 큐 재로드 후 이 job 상태만 반영 (동시 편집 안전)
      const fresh = await this.loadQueue(ws)
      const idx = fresh.jobs.findIndex((j) => j.id === job.id)
      if (idx >= 0) fresh.jobs[idx] = job
      await this.saveQueue(ws, fresh)
    }

    // 의존성 막혀 영영 못 도는 pending → skipped 표시
    const finalQueue = await this.loadQueue(ws)
    for (const j of finalQueue.jobs) {
      if (j.status === 'pending') {
        j.status = 'skipped'
        j.note = '의존 job 미완료로 실행 불가'
      }
    }
    await this.saveQueue(ws, finalQueue)

    const briefingPath = await this.writeBriefing(ws, finalQueue, opts.dateStamp)
    return {
      done: finalQueue.jobs.filter((j) => j.status === 'done').map((j) => j.id),
      blocked: finalQueue.jobs.filter((j) => j.status === 'blocked').map((j) => j.id),
      failed: finalQueue.jobs.filter((j) => j.status === 'failed').map((j) => j.id),
      skipped: finalQueue.jobs.filter((j) => j.status === 'skipped').map((j) => j.id),
      briefingPath,
      haltedReason,
    }
  }

  private async runJob(
    ws: string,
    job: FactoryJob,
    opts: FactoryRunOptions,
    env: NodeJS.ProcessEnv,
    pollMs: number,
  ): Promise<void> {
    // 계약 참조를 멤버 task 에 주입
    const members = job.members.map((m) => ({
      ...m,
      task: job.contract
        ? `${m.task ?? job.goal} — 계약 준수: ${job.contract} 를 Read 하고 따른다.`
        : m.task,
    }))

    const created = await this.ops.create({
      workspaceId: path.basename(ws),
      workspacePath: ws,
      name: `factory-${job.id}`,
      goal: job.goal,
      members,
      worktreeStrategy: 'isolated',
      mergeStrategy: 'squash',
      autoStartClaude: true,
    })
    job.teamId = created.teamId
    if (created.worktreesCreated === 0) {
      job.status = 'failed'
      job.note = 'worktree 생성 실패 (shared fallback) — 멤버 격리 불가'
      return
    }

    // 모든 멤버 완료 대기
    const start = Date.now()
    for (;;) {
      const d = await this.ops.isTeamDone(ws, created.teamId)
      if (d.done) break
      if (opts.jobTimeoutMs && opts.jobTimeoutMs > 0 && Date.now() - start > opts.jobTimeoutMs) {
        job.status = 'blocked'
        job.note = '멤버 완료 타임아웃 — worktree 보존, 사람 확인 필요'
        return
      }
      await new Promise((r) => setTimeout(r, pollMs))
    }

    // ── 머지 전 Gauntlet 게이트 ──────────────────────────────
    // 각 멤버 브랜치를 baseBranch 대비 적대 심판. blocker 있으면 머지 안 함.
    const found = await this.ops.readConfig(ws, created.teamId)
    const base = found?.config.baseBranch
    let totalBlockers = 0
    const reportLinks: string[] = []
    if (found && base) {
      for (const m of found.config.members) {
        if (!m.branch || m.branch === base) continue
        // 멤버 브랜치에 실제 commit 이 있는지 확인 (빈 검수 방지)
        const ahead = await this.commitsAhead(ws, base, m.branch, env)
        if (ahead === 0) continue
        const verdict = await this.gauntlet.run({
          workspacePath: ws,
          range: `${base}..${m.branch}`,
          judges: opts.judges?.map((model) => ({ model })),
          env,
          rateLimitRetries: 3, // Night Shift 는 넉넉히 재시도
          rateLimitBackoffMs: 60_000,
        })
        totalBlockers += verdict.blockerCount
        reportLinks.push(verdict.reportPath)
        // 심판이 전부 auth 실패면 게이트 신뢰 불가 → blocked 처리
        if (verdict.judges.every((j) => j.status === 'auth')) {
          job.status = 'blocked'
          job.note = 'Gauntlet 심판 인증 실패 (구독 로그인/크레딧) — 검수 불가, 머지 보류'
          job.gauntletReport = reportLinks.join(', ')
          return
        }
      }
    }
    job.blockerCount = totalBlockers
    job.gauntletReport = reportLinks.join(', ')

    if (totalBlockers > 0) {
      job.status = 'blocked'
      job.note = `Gauntlet blocker ${totalBlockers}건 — 머지 보류, worktree 보존, 사람 검토 필요`
      return
    }

    // 게이트 통과 → 머지 (+ 자동 archive)
    const merge = await this.ops.merge(ws, created.teamId, { mergeStrategy: 'squash' })
    if (!merge.ok) {
      job.status = 'blocked'
      job.note = `머지 실패 (충돌 등): ${merge.error ?? 'unknown'} — 사람 개입 필요`
      return
    }
    job.status = 'done'
    job.note = `머지 완료${merge.commitSha ? ` @ ${merge.commitSha.slice(0, 8)}` : ''}`
  }

  private async commitsAhead(
    ws: string,
    base: string,
    branch: string,
    env: NodeJS.ProcessEnv,
  ): Promise<number> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', ws, 'rev-list', '--count', `${base}..${branch}`],
        { timeout: 5000, env },
      )
      return parseInt(stdout.trim(), 10) || 0
    } catch {
      return 0
    }
  }

  private async writeBriefing(
    ws: string,
    queue: FactoryQueue,
    dateStamp: string,
  ): Promise<string> {
    const done = queue.jobs.filter((j) => j.status === 'done')
    const blocked = queue.jobs.filter((j) => j.status === 'blocked')
    const failed = queue.jobs.filter((j) => j.status === 'failed')
    const skipped = queue.jobs.filter((j) => j.status === 'skipped')

    const lines: string[] = []
    lines.push(`# Night Shift 브리핑 — ${dateStamp}`)
    lines.push('')
    lines.push(
      `완료 **${done.length}** · 막힘 **${blocked.length}** · 실패 ${failed.length} · 건너뜀 ${skipped.length}`,
    )
    lines.push('')
    if (done.length) {
      lines.push('## ✅ 완료 (머지됨)')
      for (const j of done) lines.push(`- **${j.id}** — ${j.goal}  ${j.note ? `(${j.note})` : ''}`)
      lines.push('')
    }
    if (blocked.length) {
      lines.push('## 🚧 사람 검토 필요 (머지 보류)')
      for (const j of blocked) {
        lines.push(`- **${j.id}** — ${j.goal}`)
        lines.push(`  - ${j.note ?? ''}`)
        if (j.gauntletReport) lines.push(`  - Gauntlet: ${j.gauntletReport}`)
        if (j.teamId) lines.push(`  - worktree 보존: \`forge-team list\` → ${j.teamId} (검토 후 merge 또는 archive)`)
      }
      lines.push('')
    }
    if (failed.length) {
      lines.push('## ❌ 실패')
      for (const j of failed) lines.push(`- **${j.id}** — ${j.goal} (${j.note ?? ''})`)
      lines.push('')
    }
    if (skipped.length) {
      lines.push('## ⏭️ 건너뜀 (의존성 막힘)')
      for (const j of skipped) lines.push(`- **${j.id}** — depends: ${(j.dependsOn ?? []).join(', ')}`)
      lines.push('')
    }
    const body = lines.join('\n') + '\n'

    const dir = path.join(ws, '.claude', 'factory')
    await fs.mkdir(dir, { recursive: true })
    const briefingPath = path.join(dir, `briefing-${dateStamp}.md`)
    await fs.writeFile(briefingPath, body, 'utf-8')

    // Obsidian 볼트 미러 (설정 시)
    await syncNote(path.basename(ws), {
      category: 'briefing',
      slug: `briefing-${dateStamp}`,
      tags: [blocked.length > 0 ? 'forge/needs-review' : 'forge/all-clear'],
      meta: { done: done.length, blocked: blocked.length, failed: failed.length },
      body,
    }).catch(() => {})

    return briefingPath
  }
}
