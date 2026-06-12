import path from 'path'
import os from 'os'
import fs from 'fs'

/**
 * ForgeConfig — 팀 동작 관련 설정의 단일 소스.
 *
 * 기존엔 TeamOperations / forge-team CLI 곳곳에 하드코딩돼 있던 값들
 * (기본 멤버 모델, 부팅 대기, tmux 스크롤백, 정리 지연, 1인팀 가드 등) 을
 * `~/.forge-studio/config.json` 한 파일로 추출했다.
 *
 * 이 모듈은 의도적으로 electron-free + 동기 I/O:
 *   - headless CLI (bin/forge-team, --experimental-strip-types) 와 Electron
 *     main 프로세스 둘 다에서 같은 코드로 로드
 *   - 파일이 없거나 깨져도 항상 FORGE_CONFIG_DEFAULTS 로 동작 (fail-open)
 *   - GUI Settings 의 "팀 동작" 카드가 forgeConfig:get/set IPC 로 편집
 */

export type AuthMode = 'subscription' | 'api'

export interface ForgeConfig {
  /** claude/codex 인증 모드 (v0.19.1). 'subscription' = 구독 랩핑 — spawn 시
   *  stray API 키 env 를 제거해 구독 로그인을 쓰게 강제 (API 키가 있으면 CLI 가
   *  구독을 무시하고 저단가 API 로 라우팅하는 문제 방지). 'api' = 그대로 둠. */
  authMode: AuthMode
  /** 멤버 spawn 시 model 미지정이면 쓰는 기본 모델 id. */
  defaultMemberModel: string
  /** claude/codex 부팅 후 task prompt 주입까지 대기 (ms). codex 는 auto-update 로 더 걸릴 수 있음. */
  memberBootWaitMs: number
  /** 멤버 tmux pane 의 history-limit (스크롤백 줄 수). */
  tmuxHistoryLimit: number
  /** 모든 멤버 완료 후 멤버 tmux 세션 자동 kill 까지 지연 (초). 0 = 즉시. */
  tmuxCleanupDelaySec: number
  /** true 면 CLI 의 단일 멤버 팀 생성 거부 (--solo 로만 허용). */
  soloTeamGuard: boolean
  /** 활성 팀이 이 개수 이상이면 create 시 경고. */
  activeTeamWarnThreshold: number
  /** merge 성공 시 worktree/tmux/브랜치 자동 archive. */
  autoArchiveOnMerge: boolean
  /** Obsidian 볼트 경로 (v0.19). 설정 시 Gauntlet 리포트/브리핑을 미러.
   *  빈 문자열 = 비활성. */
  obsidianVaultPath: string
  /** Gauntlet 기본 심판 모델 목록 (cross-provider). */
  gauntletJudges: string[]
}

export const FORGE_CONFIG_DEFAULTS: ForgeConfig = {
  authMode: 'subscription',
  defaultMemberModel: 'claude-opus-4-8',
  memberBootWaitMs: 4000,
  tmuxHistoryLimit: 50_000,
  tmuxCleanupDelaySec: 90,
  soloTeamGuard: true,
  activeTeamWarnThreshold: 3,
  autoArchiveOnMerge: true,
  obsidianVaultPath: '',
  gauntletJudges: ['claude-opus-4-8', 'gpt-5.5'],
}

export function forgeConfigPath(): string {
  return path.join(os.homedir(), '.forge-studio', 'config.json')
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/** 디스크의 설정을 defaults 위에 merge + 범위 검증해서 반환. 실패 시 defaults. */
export function loadForgeConfig(): ForgeConfig {
  let raw: Partial<Record<keyof ForgeConfig, unknown>> = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(forgeConfigPath(), 'utf-8')) as unknown
    if (parsed && typeof parsed === 'object') {
      raw = parsed as Partial<Record<keyof ForgeConfig, unknown>>
    }
  } catch {
    // 파일 없음 / 깨짐 — defaults 사용
  }
  const d = FORGE_CONFIG_DEFAULTS
  return {
    authMode: raw.authMode === 'api' ? 'api' : 'subscription',
    defaultMemberModel:
      typeof raw.defaultMemberModel === 'string' && raw.defaultMemberModel.trim()
        ? raw.defaultMemberModel.trim()
        : d.defaultMemberModel,
    memberBootWaitMs: clampInt(raw.memberBootWaitMs, 0, 60_000, d.memberBootWaitMs),
    tmuxHistoryLimit: clampInt(raw.tmuxHistoryLimit, 100, 200_000, d.tmuxHistoryLimit),
    tmuxCleanupDelaySec: clampInt(raw.tmuxCleanupDelaySec, 0, 3600, d.tmuxCleanupDelaySec),
    soloTeamGuard: asBool(raw.soloTeamGuard, d.soloTeamGuard),
    activeTeamWarnThreshold: clampInt(raw.activeTeamWarnThreshold, 1, 50, d.activeTeamWarnThreshold),
    autoArchiveOnMerge: asBool(raw.autoArchiveOnMerge, d.autoArchiveOnMerge),
    obsidianVaultPath:
      typeof raw.obsidianVaultPath === 'string' ? raw.obsidianVaultPath.trim() : d.obsidianVaultPath,
    gauntletJudges:
      Array.isArray(raw.gauntletJudges) && raw.gauntletJudges.every((j) => typeof j === 'string') && raw.gauntletJudges.length > 0
        ? (raw.gauntletJudges as string[])
        : d.gauntletJudges,
  }
}

/** 부분 업데이트를 merge 해서 저장하고 최종 설정을 반환. */
export function saveForgeConfig(partial: Partial<ForgeConfig>): ForgeConfig {
  const merged = { ...loadForgeConfig(), ...partial }
  // 저장 전에도 한 번 더 검증 (renderer 가 임의 값을 보낼 수 있음)
  const validated: ForgeConfig = {
    ...merged,
    authMode: merged.authMode === 'api' ? 'api' : 'subscription',
    defaultMemberModel: merged.defaultMemberModel.trim() || FORGE_CONFIG_DEFAULTS.defaultMemberModel,
    memberBootWaitMs: clampInt(merged.memberBootWaitMs, 0, 60_000, FORGE_CONFIG_DEFAULTS.memberBootWaitMs),
    tmuxHistoryLimit: clampInt(merged.tmuxHistoryLimit, 100, 200_000, FORGE_CONFIG_DEFAULTS.tmuxHistoryLimit),
    tmuxCleanupDelaySec: clampInt(merged.tmuxCleanupDelaySec, 0, 3600, FORGE_CONFIG_DEFAULTS.tmuxCleanupDelaySec),
    activeTeamWarnThreshold: clampInt(merged.activeTeamWarnThreshold, 1, 50, FORGE_CONFIG_DEFAULTS.activeTeamWarnThreshold),
    obsidianVaultPath: typeof merged.obsidianVaultPath === 'string' ? merged.obsidianVaultPath.trim() : '',
    gauntletJudges:
      Array.isArray(merged.gauntletJudges) && merged.gauntletJudges.length > 0
        ? merged.gauntletJudges
        : FORGE_CONFIG_DEFAULTS.gauntletJudges,
  }
  const file = forgeConfigPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(validated, null, 2) + '\n', 'utf-8')
  fs.renameSync(tmp, file)
  return validated
}

/**
 * 구독 랩핑 모드 (authMode='subscription') 이면 spawn 환경에서 stray API 키를
 * 제거해 claude/codex CLI 가 로그인된 구독을 쓰게 한다. 문서상 ANTHROPIC_API_KEY
 * 가 있으면 CLI 가 구독 대신 저단가 API 키로 라우팅된다 (= 크레딧 부족 에러의
 * 원인). OAuth/구독 토큰은 보존. authMode='api' 면 env 그대로.
 */
export function authScrubbedEnv(
  env: NodeJS.ProcessEnv,
  authMode?: AuthMode,
): NodeJS.ProcessEnv {
  const mode = authMode ?? loadForgeConfig().authMode
  if (mode !== 'subscription') return env
  const out = { ...env }
  delete out.ANTHROPIC_API_KEY
  delete out.OPENAI_API_KEY
  return out
}
