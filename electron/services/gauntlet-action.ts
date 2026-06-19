/**
 * gauntlet-action — GitHub Action "적대적 CI" 의 standalone 엔트리.
 *
 * esbuild 로 단일 파일 (.github/forge-gauntlet.mjs) 로 번들되어 CI 에서
 * `node .github/forge-gauntlet.mjs --range <range>` 로 실행된다. forge-cli /
 * Electron 의존 없이 GauntletRunner 만 끌어온다.
 *
 * CI 컨텍스트:
 *   - 인증: API 키 (secrets ANTHROPIC_API_KEY / OPENAI_API_KEY) — authMode='api'
 *     로 env 스크럽 끔 (구독 OAuth 는 headless CI 에서 불가).
 *   - 출력: 사람용 markdown 리포트를 stdout 에. GITHUB_STEP_SUMMARY 가 있으면
 *     거기에도 append (PR 체크 요약에 표시).
 *   - exit: blocker 있으면 3 (체크 실패 게이트), 심판 전원 실패면 2, 아니면 0.
 */
import fs from 'fs'
import { GauntletRunner } from './GauntletRunner.ts'

interface Args {
  range: string
  judges?: string[]
  workspace: string
}

function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (!t.startsWith('--')) continue
    const key = t.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = 'true'
    }
  }
  return {
    range: out.range ?? 'HEAD~1..HEAD',
    judges: out.judges ? out.judges.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    workspace: out.workspace ?? process.cwd(),
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const runner = new GauntletRunner()
  const verdict = await runner.run({
    workspacePath: args.workspace,
    range: args.range,
    judges: args.judges?.map((model) => ({ model })),
    authMode: 'api', // CI — secrets 의 API 키 사용
    env: { ...process.env },
    rateLimitRetries: 2,
    rateLimitBackoffMs: 20_000,
  })

  const report = runner.renderReport(verdict)
  process.stdout.write(report + '\n')

  // PR 체크 요약 (GitHub Actions)
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, report + '\n')
    } catch {
      // non-fatal
    }
  }

  // 심판 전원 실패 (인증/네트워크) → 게이트 신뢰 불가, exit 2
  if (verdict.judges.length > 0 && verdict.judges.every((j) => !j.ok)) {
    process.stderr.write('forge-gauntlet: 모든 심판 실패 — 검수 불가 (API 키/네트워크 확인)\n')
    process.exit(2)
  }
  // blocker → 체크 실패
  if (verdict.blockerCount > 0) {
    process.stderr.write(`forge-gauntlet: blocker ${verdict.blockerCount}건 — 체크 실패\n`)
    process.exit(3)
  }
  process.stdout.write('forge-gauntlet: ✅ blocker 없음\n')
}

main().catch((err: unknown) => {
  process.stderr.write(`forge-gauntlet: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
