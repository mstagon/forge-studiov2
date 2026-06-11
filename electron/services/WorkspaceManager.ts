import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { app } from 'electron'
import { execFileSync } from 'child_process'
import type { CodeReviewGraphManager } from './CodeReviewGraphManager'

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: string
  lastOpened: string
  harnessApplied: boolean
}

/**
 * Per-stack split-repo configuration. When `enabled` is true, WorkspaceManager
 * registers three git remotes (origin-client / origin-server / origin-cms)
 * pointing at `<owner>/<baseName>-{client,server,cms}` so the user can later
 * `git subtree push` each stack to its own GitHub repo.
 *
 * - `owner` is optional; if omitted we try `gh api user --jq .login`. Failure
 *   is non-fatal — the workspace still gets created, the remotes are simply
 *   skipped and logged.
 * - `protocol` selects ssh (default, `git@github.com:owner/repo.git`) or https
 *   (`https://github.com/owner/repo.git`).
 * - `autoCreateRepos` (optional) attempts `gh repo create` for each missing
 *   repo. If `gh` is unavailable or unauthenticated we skip silently.
 */
export interface SplitReposOptions {
  enabled: boolean
  baseName: string
  owner?: string
  protocol?: 'ssh' | 'https'
  autoCreateRepos?: boolean
}

export interface SplitReposResult {
  registered: { name: string; url: string }[]
  created: string[]
  skipped: { name: string; reason: string }[]
  ownerResolved: string | null
}

/**
 * Update preview shapes — emitted by `previewHarnessUpdate` so the renderer
 * can show added / removed / modified lists with a unified diff per modified
 * file before the user actually applies the update.
 */
export interface UpdatePreviewFile {
  /** POSIX-style relative path within `.claude/`. */
  rel: string
  size?: number
}

export interface UpdatePreviewModified {
  rel: string
  /** True when the file is binary (or differs in encoding) — diff omitted. */
  binary: boolean
  /** Unified diff (empty for binary). */
  diff: string
}

export interface UpdatePreview {
  added: UpdatePreviewFile[]
  removed: UpdatePreviewFile[]
  modified: UpdatePreviewModified[]
  /** Count of files identical to the template. */
  unchanged: number
}

/** Recursively walk `root` and return POSIX-style relative paths to every file. */
async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries: import('fs').Dirent[]
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as import('fs').Dirent[]
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        const rel = path.relative(root, abs).split(path.sep).join('/')
        out.push(rel)
      }
    }
  }
  await walk(root)
  return out
}

async function statSize(abs: string): Promise<number | undefined> {
  try {
    const st = await fs.stat(abs)
    return st.size
  } catch {
    return undefined
  }
}

/**
 * Read a file up to ~512KB. Files containing a NUL byte or exceeding the
 * limit are flagged binary so the diff machinery can skip them.
 */
async function readFileLimited(
  abs: string,
  maxBytes = 512 * 1024,
): Promise<{ content: string; binary: boolean }> {
  try {
    const st = await fs.stat(abs)
    if (st.size > maxBytes) return { content: '', binary: true }
    const buf = await fs.readFile(abs)
    if (buf.includes(0)) return { content: '', binary: true }
    return { content: buf.toString('utf-8'), binary: false }
  } catch {
    return { content: '', binary: true }
  }
}

/**
 * Minimal unified-diff generator. We avoid pulling in a diff dep — we emit
 * a coarse "remove all old / add all new" hunk when files differ. The
 * renderer just colours the output; precise hunking is non-essential for the
 * preview UX.
 */
function unifiedDiff(rel: string, oldText: string, newText: string): string {
  const oldLines = oldText.split(/\r?\n/)
  const newLines = newText.split(/\r?\n/)
  const hunks: string[] = []
  hunks.push(`--- a/${rel}`)
  hunks.push(`+++ b/${rel}`)
  // Compute LCS-lite: walk both arrays in parallel, group equal runs together.
  let i = 0
  let j = 0
  const lines: string[] = []
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      lines.push(' ' + oldLines[i])
      i++
      j++
      continue
    }
    // Find next sync point — the next line that exists in both within a small window.
    const window = 20
    let synced = false
    for (let k = 1; k < window && !synced; k++) {
      if (i + k < oldLines.length && oldLines[i + k] === newLines[j]) {
        for (let kk = 0; kk < k; kk++) lines.push('-' + oldLines[i + kk])
        i += k
        synced = true
      } else if (j + k < newLines.length && newLines[j + k] === oldLines[i]) {
        for (let kk = 0; kk < k; kk++) lines.push('+' + newLines[j + kk])
        j += k
        synced = true
      }
    }
    if (!synced) {
      if (i < oldLines.length) {
        lines.push('-' + oldLines[i])
        i++
      }
      if (j < newLines.length) {
        lines.push('+' + newLines[j])
        j++
      }
    }
  }
  hunks.push('@@ ' + `-1,${oldLines.length} +1,${newLines.length}` + ' @@')
  return [...hunks, ...lines].join('\n')
}

const STORE_PATH = () => path.join(app.getPath('userData'), 'workspaces.json')

export class WorkspaceManager {
  private workspaces: Workspace[] = []
  private crGraph: CodeReviewGraphManager | null

  constructor(crGraph?: CodeReviewGraphManager) {
    this.crGraph = crGraph ?? null
    this.load()
  }

  private load(): void {
    try {
      const storePath = STORE_PATH()
      if (fs.existsSync(storePath)) {
        this.workspaces = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      }
    } catch {
      this.workspaces = []
    }
  }

  private save(): void {
    try {
      const storePath = STORE_PATH()
      fs.ensureDirSync(path.dirname(storePath))
      fs.writeFileSync(storePath, JSON.stringify(this.workspaces, null, 2))
    } catch (err) {
      console.error('Failed to save workspaces:', err)
    }
  }

  async create(options: {
    name: string
    path: string
    templatePath?: string
    claudeMdPath?: string
    splitRepos?: SplitReposOptions
    /** Opt-in: kick off `code-review-graph build` once the workspace
     *  scaffolding is in place. Failures are swallowed (best-effort). */
    crGraph?: { autoBuild?: boolean }
  }): Promise<Workspace> {
    const projectPath = path.join(options.path, options.name)

    // Create project directory
    await fs.ensureDir(projectPath)

    // Copy harness template (.claude/ directory)
    if (options.templatePath && await fs.pathExists(options.templatePath)) {
      const destClaude = path.join(projectPath, '.claude')
      await fs.copy(options.templatePath, destClaude, {
        overwrite: false,
        filter: (src) => {
          const rel = path.relative(options.templatePath!, src)
          return !rel.includes('settings.local.json') && !rel.includes('.pdca-')
        },
      })
      await this.writeVersionFile(
        destClaude,
        (await this.readTemplateHarnessVersion(options.templatePath)) ?? app.getVersion(),
      )
      await this.ensureMcpRootLink(projectPath)
    }

    // Copy CLAUDE.md
    if (options.claudeMdPath && await fs.pathExists(options.claudeMdPath)) {
      await fs.copy(options.claudeMdPath, path.join(projectPath, 'CLAUDE.md'))
    }

    // Create standard directories
    await fs.ensureDir(path.join(projectPath, 'client'))
    await fs.ensureDir(path.join(projectPath, 'server'))
    await fs.ensureDir(path.join(projectPath, 'cms'))
    await fs.ensureDir(path.join(projectPath, 'docs'))

    // contracts/ — contract-first API 계약 디렉토리 (v0.14.0). 템플릿의
    // 컨벤션 문서 (README) 를 함께 시드. templatePath 는 harness-template/.claude
    // 를 가리키므로 contracts 는 그 sibling.
    await fs.ensureDir(path.join(projectPath, 'contracts'))
    if (options.templatePath) {
      const contractsSrc = path.join(options.templatePath, '..', 'contracts')
      if (await fs.pathExists(contractsSrc)) {
        await fs.copy(contractsSrc, path.join(projectPath, 'contracts'), { overwrite: false })
      }
    }

    // Initialize git
    try {
      execFileSync('git', ['init'], { cwd: projectPath, stdio: 'ignore' })
    } catch {
      // Git not available
    }

    // Optionally register split-repo remotes (origin-client/server/cms).
    // Failures here never fail workspace creation — they're additive.
    if (options.splitRepos?.enabled) {
      try {
        await this.applySplitRepos(projectPath, options.splitRepos)
      } catch (err) {
        console.error('Failed to apply splitRepos config:', err)
      }
    }

    const workspace: Workspace = {
      id: uuid(),
      name: options.name,
      path: projectPath,
      createdAt: new Date().toISOString(),
      lastOpened: new Date().toISOString(),
      harnessApplied: true,
    }

    this.workspaces.unshift(workspace)
    this.save()

    // Best-effort: kick off `code-review-graph build` in the background. We
    // don't await — workspace creation should not block on a (potentially
    // long) graph build. Errors are intentionally swallowed (the UI surfaces
    // build status separately via cr-graph:stats / a manual rebuild button).
    if (options.crGraph?.autoBuild && this.crGraph) {
      this.crGraph.build(projectPath).catch(() => {
        // graceful — CLI may not be installed yet
      })
    }

    return workspace
  }

  async open(dirPath: string): Promise<Workspace> {
    // Check if already tracked
    const existing = this.workspaces.find((w) => w.path === dirPath)
    if (existing) {
      existing.lastOpened = new Date().toISOString()
      existing.harnessApplied = await fs.pathExists(path.join(dirPath, '.claude'))
      this.save()
      return existing
    }

    const workspace: Workspace = {
      id: uuid(),
      name: path.basename(dirPath),
      path: dirPath,
      createdAt: new Date().toISOString(),
      lastOpened: new Date().toISOString(),
      harnessApplied: await fs.pathExists(path.join(dirPath, '.claude')),
    }

    this.workspaces.unshift(workspace)
    this.save()
    return workspace
  }

  list(): Workspace[] {
    return this.workspaces.sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    )
  }

  remove(id: string): void {
    this.workspaces = this.workspaces.filter((w) => w.id !== id)
    this.save()
  }

  async getInstalledVersion(workspacePath: string): Promise<string | null> {
    // v0.16 독립 버저닝: 템플릿이 들고 다니는 .claude/harness-version 이
    // 1순위 (하네스 내용이 바뀔 때만 bump). 레거시 마커 (.harness-version =
    // 설치 당시 앱 버전) 는 구버전 워크스페이스 fallback.
    for (const rel of ['harness-version', '.harness-version']) {
      const versionFile = path.join(workspacePath, '.claude', rel)
      try {
        if (await fs.pathExists(versionFile)) {
          const v = (await fs.readFile(versionFile, 'utf-8')).trim()
          if (v) return v
        }
      } catch {
        // ignore
      }
    }
    return null
  }

  /** 템플릿 (.claude 디렉토리) 의 harness-version 파일 읽기 — 없으면 null. */
  async readTemplateHarnessVersion(templatePath: string): Promise<string | null> {
    try {
      const f = path.join(templatePath, 'harness-version')
      if (await fs.pathExists(f)) {
        const v = (await fs.readFile(f, 'utf-8')).trim()
        if (v) return v
      }
    } catch {
      // ignore
    }
    return null
  }

  private async writeVersionFile(claudeDir: string, version: string): Promise<void> {
    try {
      await fs.writeFile(path.join(claudeDir, '.harness-version'), version, 'utf-8')
    } catch {
      // non-fatal
    }
  }

  /**
   * Claude Code only auto-discovers project MCP servers from <project>/.mcp.json
   * (root). Our harness convention puts it at .claude/mcp.json, so workspaces
   * miss the project-scoped servers (serena, context7, supabase, …) until the
   * user wires them by hand.
   *
   * Drop a relative symlink at <project>/.mcp.json -> .claude/mcp.json so the
   * harness file becomes the single source of truth. Idempotent: if a regular
   * file is already there, leave it alone (the user knows what they're doing);
   * if a stale symlink points elsewhere, re-point it.
   */
  private async ensureMcpRootLink(projectPath: string): Promise<void> {
    const claudeMcp = path.join(projectPath, '.claude', 'mcp.json')
    const rootMcp = path.join(projectPath, '.mcp.json')
    try {
      if (!(await fs.pathExists(claudeMcp))) return
      const existing = await fs.lstat(rootMcp).catch(() => null)
      if (existing) {
        if (!existing.isSymbolicLink()) return // user file — don't clobber
        const current = await fs.readlink(rootMcp).catch(() => null)
        if (current === '.claude/mcp.json') return // already correct
        await fs.unlink(rootMcp)
      }
      await fs.symlink('.claude/mcp.json', rootMcp)
    } catch {
      // Symlink failure shouldn't break workspace creation/update.
    }
  }

  /**
   * Diff a workspace's `.claude/` against the bundled template so the renderer
   * can show "what will change" before the user clicks Update. Walks every
   * file under both trees and bucketises into added (only in template),
   * removed (only in workspace), modified (different content), unchanged.
   * For modified files we generate a unified diff; binary or huge files are
   * marked binary and skip the diff payload.
   */
  async previewHarnessUpdate(options: {
    workspacePath: string
    templatePath: string
  }): Promise<UpdatePreview> {
    const { workspacePath, templatePath } = options
    const claudeDir = path.join(workspacePath, '.claude')
    const out: UpdatePreview = {
      added: [],
      removed: [],
      modified: [],
      unchanged: 0,
    }
    if (!(await fs.pathExists(templatePath))) return out
    const tplFiles = await listFilesRecursive(templatePath)
    const wsFiles = (await fs.pathExists(claudeDir)) ? await listFilesRecursive(claudeDir) : []
    // Skip preserved patterns — these never come from the template.
    const isPreserved = (rel: string) =>
      rel.includes('settings.local.json') ||
      rel.startsWith('agent-memory/') ||
      rel.startsWith('.pdca-')

    const tplSet = new Set(tplFiles)
    const wsSet = new Set(wsFiles)

    for (const rel of tplFiles) {
      if (!wsSet.has(rel)) {
        const abs = path.join(templatePath, rel)
        const size = await statSize(abs)
        out.added.push({ rel, size })
        continue
      }
      const tplAbs = path.join(templatePath, rel)
      const wsAbs = path.join(claudeDir, rel)
      const tpl = await readFileLimited(tplAbs)
      const ws = await readFileLimited(wsAbs)
      if (tpl.binary || ws.binary) {
        if (tpl.content !== ws.content) {
          out.modified.push({ rel, binary: true, diff: '' })
        } else {
          out.unchanged++
        }
        continue
      }
      if (tpl.content === ws.content) {
        out.unchanged++
      } else {
        out.modified.push({ rel, binary: false, diff: unifiedDiff(rel, ws.content, tpl.content) })
      }
    }
    for (const rel of wsFiles) {
      if (!tplSet.has(rel) && !isPreserved(rel)) {
        const abs = path.join(claudeDir, rel)
        const size = await statSize(abs)
        out.removed.push({ rel, size })
      }
    }
    out.added.sort((a, b) => a.rel.localeCompare(b.rel))
    out.removed.sort((a, b) => a.rel.localeCompare(b.rel))
    out.modified.sort((a, b) => a.rel.localeCompare(b.rel))
    return out
  }

  /**
   * Update a workspace's harness from the bundled template.
   * Preserves: agent-memory/, settings.local.json, .pdca-* files.
   * Backs up the existing .claude/ as .claude.bak.<timestamp>.
   */
  async updateHarness(options: {
    workspacePath: string
    templatePath: string
    claudeMdPath?: string
  }): Promise<{ backupPath: string; version: string }> {
    const { workspacePath, templatePath, claudeMdPath } = options
    const claudeDir = path.join(workspacePath, '.claude')

    if (!(await fs.pathExists(templatePath))) {
      throw new Error(`Bundled harness template not found: ${templatePath}`)
    }

    // Snapshot files to preserve from the existing .claude/
    const preserved: { rel: string; tmp: string }[] = []
    const tmpDir = path.join(workspacePath, `.claude.tmp.${Date.now()}`)

    if (await fs.pathExists(claudeDir)) {
      await fs.ensureDir(tmpDir)
      const candidates = ['agent-memory', 'settings.local.json']
      for (const rel of candidates) {
        const src = path.join(claudeDir, rel)
        if (await fs.pathExists(src)) {
          const dest = path.join(tmpDir, rel)
          await fs.copy(src, dest)
          preserved.push({ rel, tmp: dest })
        }
      }
      // Preserve any .pdca-* files at root of .claude/
      const entries = await fs.readdir(claudeDir)
      for (const entry of entries) {
        if (entry.startsWith('.pdca-')) {
          const src = path.join(claudeDir, entry)
          const dest = path.join(tmpDir, entry)
          await fs.copy(src, dest)
          preserved.push({ rel: entry, tmp: dest })
        }
      }
    }

    // Backup the existing .claude/
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(workspacePath, `.claude.bak.${stamp}`)
    if (await fs.pathExists(claudeDir)) {
      await fs.move(claudeDir, backupPath)
    }

    // Copy new bundled template
    await fs.copy(templatePath, claudeDir, {
      filter: (src) => {
        const rel = path.relative(templatePath, src)
        return !rel.includes('settings.local.json') && !rel.includes('.pdca-')
      },
    })

    // Restore preserved files
    for (const item of preserved) {
      const dest = path.join(claudeDir, item.rel)
      await fs.copy(item.tmp, dest, { overwrite: true })
    }
    await fs.remove(tmpDir).catch(() => {})

    // Update CLAUDE.md
    if (claudeMdPath && (await fs.pathExists(claudeMdPath))) {
      await fs.copy(claudeMdPath, path.join(workspacePath, 'CLAUDE.md'), { overwrite: true })
    }

    // contracts/ 컨벤션 문서 시드 — 기존 계약 파일은 절대 덮어쓰지 않음
    const contractsSrc = path.join(templatePath, '..', 'contracts')
    if (await fs.pathExists(contractsSrc)) {
      await fs.ensureDir(path.join(workspacePath, 'contracts'))
      await fs.copy(contractsSrc, path.join(workspacePath, 'contracts'), { overwrite: false })
    }

    // Write version marker — 하네스 독립 버전 (없으면 앱 버전 fallback)
    const version = (await this.readTemplateHarnessVersion(templatePath)) ?? app.getVersion()
    await this.writeVersionFile(claudeDir, version)

    // Ensure root .mcp.json symlink for Claude Code MCP auto-discovery
    await this.ensureMcpRootLink(workspacePath)

    // Mark workspace as harness-applied
    const ws = this.workspaces.find((w) => w.path === workspacePath)
    if (ws) {
      ws.harnessApplied = true
      this.save()
    }

    return { backupPath, version }
  }

  /**
   * Register `origin-client`, `origin-server`, `origin-cms` remotes pointing at
   * `<owner>/<baseName>-{stack}` repos. If `autoCreateRepos` is set we also try
   * `gh repo create` (private) for each. All operations are best-effort: a
   * missing `gh` binary or auth failure means we register what we can and move
   * on.
   */
  private async applySplitRepos(
    projectPath: string,
    config: SplitReposOptions
  ): Promise<SplitReposResult> {
    const result: SplitReposResult = {
      registered: [],
      created: [],
      skipped: [],
      ownerResolved: null,
    }

    const baseName = config.baseName.trim()
    if (!baseName) {
      result.skipped.push({ name: '*', reason: 'baseName is empty' })
      return result
    }

    const owner = (config.owner?.trim() || (await this.resolveGithubOwner())) ?? null
    result.ownerResolved = owner
    if (!owner) {
      result.skipped.push({ name: '*', reason: 'owner not provided and gh CLI unavailable' })
      return result
    }

    const protocol = config.protocol ?? 'ssh'
    const stacks = ['client', 'server', 'cms'] as const

    for (const stack of stacks) {
      const repoName = `${baseName}-${stack}`
      const remoteName = `origin-${stack}`
      const url = this.buildRemoteUrl(owner, repoName, protocol)

      if (config.autoCreateRepos) {
        const created = this.tryCreateGithubRepo(owner, repoName)
        if (created) result.created.push(repoName)
      }

      try {
        execFileSync('git', ['remote', 'add', remoteName, url], {
          cwd: projectPath,
          stdio: 'ignore',
        })
        result.registered.push({ name: remoteName, url })
      } catch {
        // Remote may already exist (idempotent retry path) — try set-url instead.
        try {
          execFileSync('git', ['remote', 'set-url', remoteName, url], {
            cwd: projectPath,
            stdio: 'ignore',
          })
          result.registered.push({ name: remoteName, url })
        } catch {
          result.skipped.push({ name: remoteName, reason: 'git remote add/set-url failed' })
        }
      }
    }

    return result
  }

  private async resolveGithubOwner(): Promise<string | null> {
    try {
      const out = execFileSync('gh', ['api', 'user', '--jq', '.login'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const login = out.trim()
      return login || null
    } catch {
      return null
    }
  }

  private buildRemoteUrl(owner: string, repoName: string, protocol: 'ssh' | 'https'): string {
    return protocol === 'https'
      ? `https://github.com/${owner}/${repoName}.git`
      : `git@github.com:${owner}/${repoName}.git`
  }

  /**
   * Best-effort `gh repo create` for a single repo. Returns true only when the
   * command succeeded; missing `gh`, missing auth, or repo-already-exists all
   * return false (caller treats it as "skip").
   */
  private tryCreateGithubRepo(owner: string, repoName: string): boolean {
    try {
      execFileSync('gh', ['repo', 'create', `${owner}/${repoName}`, '--private', '--confirm'], {
        stdio: 'ignore',
      })
      return true
    } catch {
      return false
    }
  }
}
