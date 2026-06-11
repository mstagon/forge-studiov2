import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import {
  composePreset,
  cleanupComposed,
  readPresetManifest as readComposeManifest,
  type PresetManifest as ComposeManifest,
} from './PresetCompose'

/**
 * PresetManager — bundles + user-saved harness presets.
 *
 * Two sources:
 *
 *   1. Bundled presets, shipped under `resources/presets/<id>/.claude/`.
 *      v0.15 현재 bundled preset 은 없다 — 기본 하네스는 harness-template
 *      자체이고, New Workspace 의 '__default__' 가 그걸 가리킨다. (구버전
 *      주석의 flutter-nest/nextjs-only/empty 는 실재한 적 없는 베이퍼였음 —
 *      감사 문서 참조.) 디렉토리가 생기면 자동으로 목록에 뜬다.
 *
 *   2. User-saved presets in `~/.claude/my-presets/<id>/.claude/`. The user
 *      can capture the current workspace's `.claude/` as a preset and reuse
 *      it across new workspaces. Read/write.
 *
 * The renderer surfaces both lists; New Workspace dialog shows them in a
 * single picker.
 */

export interface PresetInfo {
  id: string
  /** Display name — falls back to `id`. */
  name: string
  description?: string
  source: 'bundled' | 'user'
  /** Absolute path to the preset's `.claude/` directory. */
  templatePath: string
  /** Optional sibling `CLAUDE.md`, when the preset ships one. */
  claudeMdPath?: string
  /** v0.17 — base harness-template 상속 프리셋 (델타만 보유). */
  extendsDefault?: boolean
  /** 프리셋 루트 디렉토리 (manifest/overlay 위치). */
  presetDir: string
  /** 프리셋 선택 시 옵트인으로 묻는 MCP 목록 (v0.18). */
  optionalMcp?: Array<{ id: string; label: string; hint?: string }>
}

interface PresetManifest {
  name?: string
  description?: string
  extends?: 'default'
  exclude?: string[]
  optionalMcp?: Array<{ id: string; label: string; hint?: string }>
}

export class PresetManager {
  /** Resolve the bundled presets root for both packaged + dev runs. */
  private bundledRoot(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'presets')
    }
    return path.resolve(__dirname, '..', 'resources', 'presets')
  }

  /** `~/.claude/my-presets/`. Created lazily on first save. */
  private userRoot(): string {
    return path.join(os.homedir(), '.claude', 'my-presets')
  }

  /** 번들 harness-template 루트 ({.claude, CLAUDE.md, contracts}). */
  private baseTemplateRoot(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'harness-template')
    }
    return path.resolve(__dirname, '..', 'resources', 'harness-template')
  }

  /**
   * 프리셋 id → 실제 사용할 templatePath/claudeMdPath 해석 (v0.17).
   * 상속 프리셋이면 base + 델타를 tmp 에 합성해서 반환 — 호출자는 복사가
   * 끝나면 cleanup() 호출. 정적 프리셋이면 그대로 + no-op cleanup.
   */
  async resolveTemplatePaths(
    presetId: string,
    opts: { mcpChoices?: string[] } = {},
  ): Promise<{
    templatePath: string
    claudeMdPath?: string
    cleanup: () => Promise<void>
  } | null> {
    const preset = await this.findPreset(presetId)
    if (!preset) return null
    if (preset.extendsDefault) {
      const manifest = (await readComposeManifest(preset.presetDir)) ?? ({} as ComposeManifest)
      const composed = await composePreset(this.baseTemplateRoot(), preset.presetDir, manifest, opts)
      return {
        templatePath: composed.templatePath,
        claudeMdPath: composed.claudeMdPath,
        cleanup: () => cleanupComposed(composed),
      }
    }
    return {
      templatePath: preset.templatePath,
      claudeMdPath: preset.claudeMdPath,
      cleanup: async () => {},
    }
  }

  async listPresets(): Promise<PresetInfo[]> {
    const out: PresetInfo[] = []
    const bundled = this.bundledRoot()
    if (await fs.pathExists(bundled)) {
      out.push(...(await this.scanRoot(bundled, 'bundled')))
    }
    const user = this.userRoot()
    if (await fs.pathExists(user)) {
      out.push(...(await this.scanRoot(user, 'user')))
    }
    // Stable ordering: bundled first, then user presets alphabetically.
    out.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'bundled' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return out
  }

  private async scanRoot(root: string, source: 'bundled' | 'user'): Promise<PresetInfo[]> {
    const out: PresetInfo[] = []
    let entries: import('fs').Dirent[]
    try {
      entries = (await fs.readdir(root, { withFileTypes: true })) as import('fs').Dirent[]
    } catch {
      return out
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const presetDir = path.join(root, entry.name)
      const templatePath = path.join(presetDir, '.claude')
      const manifest = await this.readManifest(presetDir)
      const extendsDefault = manifest?.extends === 'default'
      // 정적 프리셋은 .claude 필수, 상속 프리셋은 manifest 만으로 성립
      if (!extendsDefault && !(await fs.pathExists(templatePath))) continue
      const claudeMdPath = path.join(presetDir, 'CLAUDE.md')
      out.push({
        id: entry.name,
        name: manifest?.name ?? entry.name,
        description: manifest?.description,
        source,
        templatePath,
        claudeMdPath: (await fs.pathExists(claudeMdPath)) ? claudeMdPath : undefined,
        extendsDefault,
        presetDir,
        optionalMcp: Array.isArray(manifest?.optionalMcp) ? manifest?.optionalMcp : undefined,
      })
    }
    return out
  }

  private async readManifest(dir: string): Promise<PresetManifest | null> {
    const file = path.join(dir, 'preset.json')
    if (!(await fs.pathExists(file))) return null
    try {
      const raw = await fs.readFile(file, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as PresetManifest
    } catch {
      // ignore
    }
    return null
  }

  /**
   * Locate a preset by id. Prefers user presets when both sources have the
   * same id — gives the user an override knob.
   */
  async findPreset(id: string): Promise<PresetInfo | null> {
    const all = await this.listPresets()
    const user = all.find((p) => p.id === id && p.source === 'user')
    if (user) return user
    return all.find((p) => p.id === id) ?? null
  }

  /**
   * Apply (copy) a preset's `.claude/` into a workspace. Differs from
   * `WorkspaceManager.updateHarness` in two ways:
   *
   *   1. We copy *forward* into the workspace without backing up — this is
   *      meant for fresh workspaces. Caller is responsible for prompting the
   *      user when overwriting an existing harness.
   *   2. We never overwrite preserved files (settings.local.json, agent-memory).
   */
  async applyPreset(workspacePath: string, presetId: string): Promise<{ ok: true; preset: PresetInfo }> {
    const preset = await this.findPreset(presetId)
    if (!preset) throw new Error(`Preset not found: ${presetId}`)
    // v0.17 — 상속 프리셋은 base + 델타 합성 결과를 복사
    const resolved = await this.resolveTemplatePaths(presetId)
    if (!resolved || !(await fs.pathExists(resolved.templatePath))) {
      throw new Error(`Preset has no usable template: ${presetId}`)
    }
    try {
      const destClaude = path.join(workspacePath, '.claude')
      await fs.ensureDir(destClaude)
      await fs.copy(resolved.templatePath, destClaude, {
        overwrite: false,
        filter: (src) => {
          const rel = path.relative(resolved.templatePath, src)
          return !rel.includes('settings.local.json') && !rel.includes('.pdca-')
        },
      })
      if (resolved.claudeMdPath && (await fs.pathExists(resolved.claudeMdPath))) {
        const destClaudeMd = path.join(workspacePath, 'CLAUDE.md')
        if (!(await fs.pathExists(destClaudeMd))) {
          await fs.copy(resolved.claudeMdPath, destClaudeMd)
        }
      }
    } finally {
      await resolved.cleanup().catch(() => {})
    }
    return { ok: true, preset }
  }

  /**
   * Snapshot the current workspace's `.claude/` (and CLAUDE.md when present)
   * into `~/.claude/my-presets/<id>/`. Idempotent — overwrites the previous
   * snapshot for the same id. We strip preserved files (settings.local,
   * agent-memory) so user secrets/state never leak into a preset.
   */
  async saveAsPreset(options: {
    workspacePath: string
    id: string
    name?: string
    description?: string
  }): Promise<PresetInfo> {
    const { workspacePath, id } = options
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`Invalid preset id "${id}". Use lowercase letters, digits, and hyphens.`)
    }
    const claudeDir = path.join(workspacePath, '.claude')
    if (!(await fs.pathExists(claudeDir))) {
      throw new Error(`Workspace has no .claude/ to save: ${workspacePath}`)
    }
    const userRoot = this.userRoot()
    await fs.ensureDir(userRoot)
    const dest = path.join(userRoot, id)
    await fs.remove(dest)
    await fs.ensureDir(dest)
    await fs.copy(claudeDir, path.join(dest, '.claude'), {
      filter: (src) => {
        const rel = path.relative(claudeDir, src)
        return (
          !rel.includes('settings.local.json') &&
          !rel.startsWith('agent-memory') &&
          !rel.includes('.pdca-')
        )
      },
    })
    const sourceClaudeMd = path.join(workspacePath, 'CLAUDE.md')
    if (await fs.pathExists(sourceClaudeMd)) {
      await fs.copy(sourceClaudeMd, path.join(dest, 'CLAUDE.md'))
    }
    const manifest: PresetManifest = {}
    if (options.name) manifest.name = options.name
    if (options.description) manifest.description = options.description
    if (Object.keys(manifest).length > 0) {
      await fs.writeFile(path.join(dest, 'preset.json'), JSON.stringify(manifest, null, 2), 'utf-8')
    }
    return {
      id,
      name: manifest.name ?? id,
      description: manifest.description,
      source: 'user',
      presetDir: dest,
      templatePath: path.join(dest, '.claude'),
      claudeMdPath: (await fs.pathExists(path.join(dest, 'CLAUDE.md')))
        ? path.join(dest, 'CLAUDE.md')
        : undefined,
    }
  }

  /** Delete a user preset (bundled presets cannot be deleted). */
  async deletePreset(id: string): Promise<void> {
    const dest = path.join(this.userRoot(), id)
    if (!(await fs.pathExists(dest))) return
    await fs.remove(dest)
  }

  /**
   * Import an agent / skill / command from a URL or local file path.
   *
   * - URL handles `http://`, `https://`, and `file://` (we lean on the global
   *   `fetch` for HTTP and `fs.readFile` for `file://`).
   * - The fetched body must contain YAML frontmatter; we validate `name` for
   *   agents/commands and copy a `SKILL.md` for skills.
   * - For skills, the source must end with `SKILL.md` *or* the resulting
   *   filename will be coerced to `SKILL.md` and dropped under
   *   `<workspace>/.claude/skills/<name>/SKILL.md`.
   */
  async importFromUrl(options: {
    workspacePath: string
    kind: 'agent' | 'skill' | 'command'
    url: string
  }): Promise<{ ok: true; file: string; name: string }> {
    const { workspacePath, kind, url } = options
    const body = await fetchText(url)
    const { data } = parseFrontmatterMinimal(body)
    const name = data.name?.trim()
    if (!name) {
      throw new Error('Imported file is missing `name:` frontmatter')
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new Error(`Frontmatter name "${name}" must be lowercase / hyphen-only`)
    }
    const claudeDir = path.join(workspacePath, '.claude')
    let dest: string
    if (kind === 'agent') {
      dest = path.join(claudeDir, 'agents', `${name}.md`)
    } else if (kind === 'command') {
      dest = path.join(claudeDir, 'commands', `${name}.md`)
    } else {
      dest = path.join(claudeDir, 'skills', name, 'SKILL.md')
    }
    if (await fs.pathExists(dest)) {
      throw new Error(`${kind} "${name}" already exists at ${path.relative(workspacePath, dest)}`)
    }
    await fs.ensureDir(path.dirname(dest))
    await fs.writeFile(dest, body, 'utf-8')
    return { ok: true, file: dest, name }
  }
}

/** Fetch a URL or `file://` path, returning the body as UTF-8 text. */
async function fetchText(url: string): Promise<string> {
  if (url.startsWith('file://')) {
    const file = url.replace(/^file:\/\//, '')
    return fs.readFile(file, 'utf-8')
  }
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return res.text()
  }
  // Treat as a local absolute path.
  if (path.isAbsolute(url)) {
    return fs.readFile(url, 'utf-8')
  }
  throw new Error(`Unsupported URL/path: ${url}`)
}

/** Tiny duplicate of HarnessScanner's frontmatter parser to avoid a circular dep. */
function parseFrontmatterMinimal(raw: string): { data: Record<string, string> } {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { data: {} }
  const data: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break
    const colon = lines[i].indexOf(':')
    if (colon === -1) continue
    const key = lines[i].slice(0, colon).trim()
    let value = lines[i].slice(colon + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) data[key] = value
  }
  return { data }
}
