import path from 'path'
import os from 'os'
import fs from 'fs-extra'

/**
 * PresetCompose — "base 상속 + 델타" 프리셋 합성 엔진 (v0.17).
 *
 * 문제: 프리셋을 정적 디렉토리로 통째 복제하면 base 하네스가 바뀔 때마다
 * 프리셋 N개를 같이 고쳐야 한다 (v0.15 감사에서 확인된 베이퍼 프리셋의
 * 근본 원인 — 동기화가 불가능해서 아무도 안 채움).
 *
 * 해법: 프리셋은 다음만 갖는다.
 *   presets/<id>/preset.json   — { name, description, extends: "default", exclude: [...] }
 *   presets/<id>/.claude/**    — overlay (base 위에 덮어쓸 파일들)
 *   presets/<id>/CLAUDE.md     — overlay (있으면 base CLAUDE.md 대체)
 *   presets/<id>/contracts/**  — overlay (선택)
 *
 * compose() 가 tmp 디렉토리에 base 전체를 복사하고 exclude 패턴을 지운 뒤
 * overlay 를 덮는다. 결과 디렉토리는 harness-template 과 동일한 레이아웃
 * ({.claude, CLAUDE.md, contracts}) 이라 WorkspaceManager.create 의
 * templatePath/claudeMdPath 로 그대로 들어간다.
 *
 * exclude 패턴 (의도적으로 단순 — minimatch 의존성 없이):
 *   "skills/freezed-models"     → .claude/ 기준 디렉토리/파일 prefix 매칭
 *   "agents/flutter-*"          → 마지막 세그먼트 와일드카드 (prefix*)
 *   "rules/common/testing.md"   → 정확한 파일
 * 모든 패턴은 .claude/ 루트 기준 상대 경로다.
 */

export interface PresetManifest {
  name?: string
  description?: string
  /** "default" = 번들 harness-template 상속. 생략 시 정적 프리셋 (옛 동작). */
  extends?: 'default'
  /** .claude/ 기준 상대 경로 패턴 — 합성 시 제거할 항목들. */
  exclude?: string[]
}

export async function readPresetManifest(presetDir: string): Promise<PresetManifest | null> {
  try {
    const raw = await fs.readFile(path.join(presetDir, 'preset.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as PresetManifest
  } catch {
    // 없거나 깨짐
  }
  return null
}

/** 단순 패턴 매칭 — rel(.claude 기준)이 패턴에 걸리는지. */
export function matchesExclude(rel: string, pattern: string): boolean {
  const normRel = rel.replace(/\\/g, '/')
  const p = pattern.replace(/\\/g, '/').replace(/\/+$/, '')
  if (p.endsWith('*')) {
    // 마지막 세그먼트 prefix 와일드카드: "agents/flutter-*"
    const prefix = p.slice(0, -1)
    return normRel.startsWith(prefix)
  }
  // 정확 일치 또는 디렉토리 prefix: "skills/freezed-models" 는
  // "skills/freezed-models/SKILL.md" 도 매칭
  return normRel === p || normRel.startsWith(p + '/')
}

export interface ComposedPreset {
  /** harness-template 레이아웃의 tmp 루트. */
  rootDir: string
  /** rootDir/.claude — WorkspaceManager.create 의 templatePath 로 사용. */
  templatePath: string
  /** rootDir/CLAUDE.md (존재 시). */
  claudeMdPath?: string
  /** 합성에서 제거된 항목 수 (진단용). */
  excludedCount: number
}

/**
 * base 템플릿 루트 (harness-template — {.claude, CLAUDE.md, contracts} 포함)
 * 와 프리셋 디렉토리를 합성해 tmp 루트를 만든다. 호출자가 작업 끝나면
 * cleanupComposed() 로 정리 (안 해도 OS tmp 정리에 맡겨도 무해).
 */
export async function composePreset(
  baseRootDir: string,
  presetDir: string,
  manifest: PresetManifest,
): Promise<ComposedPreset> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-preset-'))

  // 1. base 전체 복사 ({.claude, CLAUDE.md, contracts, README.md...})
  await fs.copy(baseRootDir, rootDir, {
    filter: (src) => {
      const rel = path.relative(baseRootDir, src)
      return !rel.includes('settings.local.json') && !rel.includes('.pdca-')
    },
  })

  // 2. exclude 적용 (.claude/ 기준)
  const claudeDir = path.join(rootDir, '.claude')
  let excludedCount = 0
  const patterns = manifest.exclude ?? []
  if (patterns.length > 0 && (await fs.pathExists(claudeDir))) {
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const abs = path.join(dir, e.name)
        const rel = path.relative(claudeDir, abs)
        if (patterns.some((p) => matchesExclude(rel, p))) {
          await fs.remove(abs)
          excludedCount++
          continue
        }
        if (e.isDirectory()) await walk(abs)
      }
    }
    await walk(claudeDir)
  }

  // 3. overlay — 프리셋의 .claude / CLAUDE.md / contracts 를 위에 덮기
  const overlayClaude = path.join(presetDir, '.claude')
  if (await fs.pathExists(overlayClaude)) {
    await fs.copy(overlayClaude, claudeDir, { overwrite: true })
  }
  const overlayClaudeMd = path.join(presetDir, 'CLAUDE.md')
  if (await fs.pathExists(overlayClaudeMd)) {
    await fs.copy(overlayClaudeMd, path.join(rootDir, 'CLAUDE.md'), { overwrite: true })
  }
  const overlayContracts = path.join(presetDir, 'contracts')
  if (await fs.pathExists(overlayContracts)) {
    await fs.copy(overlayContracts, path.join(rootDir, 'contracts'), { overwrite: true })
  }

  const claudeMd = path.join(rootDir, 'CLAUDE.md')
  return {
    rootDir,
    templatePath: claudeDir,
    claudeMdPath: (await fs.pathExists(claudeMd)) ? claudeMd : undefined,
    excludedCount,
  }
}

export async function cleanupComposed(composed: ComposedPreset): Promise<void> {
  await fs.remove(composed.rootDir).catch(() => {})
}
