import path from 'path'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolveProvider } from './ProviderRouter.ts'
import { syncNote } from './VaultSync.ts'

const execFileAsync = promisify(execFile)

/**
 * GauntletRunner — cross-provider 적대 심판 (v0.19).
 *
 * 핵심 명제: 중립 코드 심판은 영원히 서드파티 자리다. Anthropic 은 GPT 심판을,
 * OpenAI 는 Claude 심판을 자기 제품에 넣지 않는다. Forge 는 둘 다 부른다.
 *
 * diff 를 여러 provider 의 headless CLI 에 "적대적으로 검수하라" 고 던지고,
 * 각자의 findings 를 통합해 verdict 를 만든다. 2개+ 심판이 같은 file:line 을
 * 지적하면 confidence 를 승격 (교차 합의), 1개만이면 "단독 주장" 으로 표시.
 *
 * electron-free + headless: forge-team CLI 와 Electron main 양쪽에서 쓴다.
 */

export interface JudgeSpec {
  /** model id — ProviderRouter 가 claude/codex 로 매핑. */
  model: string
}

export interface GauntletFinding {
  severity: 'blocker' | 'major' | 'minor' | 'nit'
  file: string
  line?: number
  claim: string
  repro?: string
  confidence: 'high' | 'medium' | 'low'
}

export interface JudgeResult {
  model: string
  provider: string
  ok: boolean
  findings: GauntletFinding[]
  /** 심판이 아무것도 못 찾았으면 명시 (적대 심판은 "깨끗함" 도 신호). */
  clean: boolean
  error?: string
  rawExcerpt?: string
}

export interface GauntletVerdict {
  range: string
  judges: JudgeResult[]
  /** file:line 키로 2개+ 심판이 합의한 findings (confidence 승격). */
  consensus: Array<GauntletFinding & { agreedBy: string[] }>
  /** 단독 주장 (1개 심판만). */
  solo: Array<GauntletFinding & { by: string }>
  blockerCount: number
  jsonPath: string
  reportPath: string
}

export interface GauntletOptions {
  workspacePath: string
  /** git diff range, 예: "HEAD~1..HEAD" 또는 "main..feat/x". */
  range: string
  /** 심판 구성. 기본 = claude + codex 혼성 (cross-provider). */
  judges?: JudgeSpec[]
  env?: NodeJS.ProcessEnv
  /** diff 가 이 바이트를 넘으면 잘라서 프롬프트에 (토큰 폭발 방지). */
  maxDiffBytes?: number
}

const DEFAULT_JUDGES: JudgeSpec[] = [{ model: 'claude-opus-4-8' }, { model: 'gpt-5.5' }]

const PROMPT_HEADER = `당신은 적대적 코드 심판이다. 아래 git diff 를 공격적으로 검수하라.
목표는 버그 / 보안 결함 / 회귀 / 계약 위반을 찾는 것. 칭찬 금지. 사소한 스타일은 무시.
정말 문제가 없으면 솔직히 "clean" 이라고 하라 (없는 문제를 지어내지 마라).

반드시 아래 JSON 만 출력 (코드블록 없이, 다른 텍스트 없이):
{"clean": <bool>, "findings": [{"severity":"blocker|major|minor|nit","file":"<path>","line":<int|null>,"claim":"<무엇이 왜 문제인가>","repro":"<재현/근거>","confidence":"high|medium|low"}]}

severity 기준: blocker=머지 불가(데이터손실/보안/크래시), major=곧 터질 버그,
minor=경계 케이스, nit=권장. confidence 는 본인 확신도.

--- DIFF ---
`

export class GauntletRunner {
  async run(opts: GauntletOptions): Promise<GauntletVerdict> {
    const env = opts.env ?? process.env
    const judges = opts.judges?.length ? opts.judges : DEFAULT_JUDGES
    const maxDiff = opts.maxDiffBytes ?? 120_000

    // diff 수집
    let diff = ''
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', opts.workspacePath, 'diff', opts.range],
        { timeout: 15_000, env, maxBuffer: 32 * 1024 * 1024 },
      )
      diff = stdout
    } catch (err) {
      throw new Error(`git diff 실패 (${opts.range}): ${(err as Error).message}`)
    }
    if (!diff.trim()) {
      throw new Error(`diff 가 비어있음 (${opts.range}) — 검수할 변경 없음`)
    }
    let truncated = false
    if (Buffer.byteLength(diff) > maxDiff) {
      diff = diff.slice(0, maxDiff)
      truncated = true
    }
    const prompt =
      PROMPT_HEADER + diff + (truncated ? '\n\n[... diff 잘림 — 큰 변경, 핵심만 검수 ...]' : '')

    // 심판 병렬 실행
    const results = await Promise.all(
      judges.map((j) => this.runJudge(j, prompt, opts.workspacePath, env)),
    )

    // 합의/단독 분리
    const keyOf = (f: GauntletFinding) => `${f.file}:${f.line ?? '?'}`
    const byKey = new Map<string, Array<{ f: GauntletFinding; model: string }>>()
    for (const r of results) {
      for (const f of r.findings) {
        const k = keyOf(f)
        if (!byKey.has(k)) byKey.set(k, [])
        byKey.get(k)!.push({ f, model: r.model })
      }
    }
    const consensus: GauntletVerdict['consensus'] = []
    const solo: GauntletVerdict['solo'] = []
    for (const [, group] of byKey) {
      if (group.length >= 2) {
        // 가장 높은 severity 채택 + confidence high 승격
        const top = group.slice().sort((a, b) => sevRank(b.f.severity) - sevRank(a.f.severity))[0]
        consensus.push({ ...top.f, confidence: 'high', agreedBy: group.map((g) => g.model) })
      } else {
        solo.push({ ...group[0].f, by: group[0].model })
      }
    }
    const blockerCount =
      consensus.filter((c) => c.severity === 'blocker').length +
      solo.filter((s) => s.severity === 'blocker').length

    // 영속
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = path.join(opts.workspacePath, '.claude', 'gauntlet')
    await fs.mkdir(dir, { recursive: true })
    const jsonPath = path.join(dir, `${ts}.json`)
    const reportPath = path.join(dir, `${ts}.md`)
    const verdict: GauntletVerdict = {
      range: opts.range,
      judges: results,
      consensus,
      solo,
      blockerCount,
      jsonPath,
      reportPath,
    }
    const report = this.renderReport(verdict)
    await fs.writeFile(jsonPath, JSON.stringify(verdict, null, 2), 'utf-8')
    await fs.writeFile(reportPath, report, 'utf-8')

    // Obsidian 볼트 미러 (설정된 경우만 — non-fatal)
    await syncNote(path.basename(opts.workspacePath), {
      category: 'gauntlet',
      slug: `${ts}-${opts.range.replace(/[^A-Za-z0-9.]/g, '_')}`,
      tags: [verdict.blockerCount > 0 ? 'forge/blocker' : 'forge/clean'],
      meta: { range: opts.range, blockers: verdict.blockerCount, judges: judges.map((j) => j.model).join('+') },
      body: report,
    }).catch(() => {})

    return verdict
  }

  private async runJudge(
    judge: JudgeSpec,
    prompt: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): Promise<JudgeResult> {
    const spec = resolveProvider(judge.model)
    try {
      let stdout = ''
      if (spec.provider === 'claude') {
        const args = ['-p', prompt, '--output-format', 'json']
        if (spec.modelArg) args.push('--model', spec.modelArg)
        const r = await execFileAsync('claude', args, {
          cwd,
          timeout: 240_000,
          env,
          maxBuffer: 16 * 1024 * 1024,
        })
        stdout = r.stdout
      } else {
        // codex exec — 비대화형. 프롬프트는 인자로.
        const args = ['exec', '--dangerously-bypass-approvals-and-sandbox']
        if (spec.modelArg) args.push('-m', spec.modelArg)
        args.push(prompt)
        const r = await execFileAsync('codex', args, {
          cwd,
          timeout: 240_000,
          env,
          maxBuffer: 16 * 1024 * 1024,
        })
        stdout = r.stdout
      }
      const parsed = this.extractJson(stdout, spec.provider)
      return {
        model: judge.model,
        provider: spec.provider,
        ok: true,
        clean: parsed.clean ?? (parsed.findings?.length ?? 0) === 0,
        findings: this.sanitizeFindings(parsed.findings ?? []),
        rawExcerpt: stdout.slice(0, 400),
      }
    } catch (err) {
      return {
        model: judge.model,
        provider: spec.provider,
        ok: false,
        clean: false,
        findings: [],
        error: (err as Error).message.slice(0, 300),
      }
    }
  }

  /**
   * 심판 출력에서 verdict JSON 추출. claude --output-format json 은 봉투
   * ({type, result, ...}) 로 감싸므로 result 안의 텍스트에서 JSON 을 뽑고,
   * codex 는 stdout 본문에서 마지막 JSON 객체를 찾는다.
   */
  private extractJson(
    raw: string,
    provider: string,
  ): { clean?: boolean; findings?: GauntletFinding[] } {
    let text = raw
    if (provider === 'claude') {
      try {
        const env = JSON.parse(raw)
        if (typeof env?.result === 'string') text = env.result
      } catch {
        // 봉투 파싱 실패 — raw 그대로 탐색
      }
    }
    // 텍스트에서 findings/clean 을 가진 JSON 객체 추출 (가장 마지막 후보)
    const candidates = text.match(/\{[\s\S]*?\}/g) ?? []
    for (const c of candidates.reverse()) {
      try {
        const obj = JSON.parse(c)
        if (typeof obj === 'object' && (Array.isArray(obj.findings) || typeof obj.clean === 'boolean')) {
          return obj
        }
      } catch {
        // 다음 후보
      }
    }
    // 중괄호 균형 스캔 fallback (중첩 때문에 위 regex 가 놓칠 수 있음)
    const start = text.indexOf('{"clean"')
    if (start >= 0) {
      let depth = 0
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') {
          depth--
          if (depth === 0) {
            try {
              return JSON.parse(text.slice(start, i + 1))
            } catch {
              break
            }
          }
        }
      }
    }
    return {}
  }

  private sanitizeFindings(arr: unknown[]): GauntletFinding[] {
    const sevs = new Set(['blocker', 'major', 'minor', 'nit'])
    const confs = new Set(['high', 'medium', 'low'])
    const out: GauntletFinding[] = []
    for (const x of arr) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      const severity = sevs.has(String(o.severity)) ? (o.severity as GauntletFinding['severity']) : 'minor'
      const confidence = confs.has(String(o.confidence))
        ? (o.confidence as GauntletFinding['confidence'])
        : 'medium'
      out.push({
        severity,
        file: String(o.file ?? '(unknown)'),
        line: typeof o.line === 'number' ? o.line : undefined,
        claim: String(o.claim ?? '').slice(0, 600),
        repro: o.repro ? String(o.repro).slice(0, 600) : undefined,
        confidence,
      })
    }
    return out
  }

  renderReport(v: GauntletVerdict): string {
    const lines: string[] = []
    lines.push(`# Gauntlet Verdict — ${v.range}`)
    lines.push('')
    lines.push(
      `심판: ${v.judges.map((j) => `${j.model}(${j.provider}${j.ok ? '' : ' ✗'})`).join(' · ')}`,
    )
    lines.push(`Blocker: **${v.blockerCount}** · 합의 ${v.consensus.length} · 단독 ${v.solo.length}`)
    lines.push('')
    if (v.blockerCount === 0 && v.consensus.length === 0 && v.solo.length === 0) {
      lines.push('✅ 모든 심판 통과 — 발견된 문제 없음.')
    }
    if (v.consensus.length > 0) {
      lines.push('## 교차 합의 (2개+ 심판)')
      for (const c of v.consensus.sort((a, b) => sevRank(b.severity) - sevRank(a.severity))) {
        lines.push(`- **[${c.severity}]** \`${c.file}${c.line ? ':' + c.line : ''}\` — ${c.claim}`)
        if (c.repro) lines.push(`  - 근거: ${c.repro}`)
        lines.push(`  - 합의: ${c.agreedBy.join(', ')}`)
      }
      lines.push('')
    }
    if (v.solo.length > 0) {
      lines.push('## 단독 주장 (1개 심판 — 참고)')
      for (const s of v.solo.sort((a, b) => sevRank(b.severity) - sevRank(a.severity))) {
        lines.push(`- [${s.severity}] \`${s.file}${s.line ? ':' + s.line : ''}\` — ${s.claim} _(${s.by})_`)
      }
      lines.push('')
    }
    for (const j of v.judges.filter((x) => !x.ok)) {
      lines.push(`> ⚠️ 심판 ${j.model} 실패: ${j.error}`)
    }
    return lines.join('\n') + '\n'
  }
}

function sevRank(s: string): number {
  return { blocker: 3, major: 2, minor: 1, nit: 0 }[s] ?? 0
}
