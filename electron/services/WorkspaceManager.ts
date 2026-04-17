import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { app } from 'electron'
import { execFileSync } from 'child_process'

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: string
  lastOpened: string
  harnessApplied: boolean
}

const STORE_PATH = () => path.join(app.getPath('userData'), 'workspaces.json')

export class WorkspaceManager {
  private workspaces: Workspace[] = []

  constructor() {
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

  async create(options: { name: string; path: string; templatePath?: string; claudeMdPath?: string }): Promise<Workspace> {
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
      await this.writeVersionFile(destClaude, app.getVersion())
      await this.ensureMcpRootLink(projectPath)
    }

    // Copy CLAUDE.md
    if (options.claudeMdPath && await fs.pathExists(options.claudeMdPath)) {
      await fs.copy(options.claudeMdPath, path.join(projectPath, 'CLAUDE.md'))
    }

    // Create standard directories
    await fs.ensureDir(path.join(projectPath, 'lib'))
    await fs.ensureDir(path.join(projectPath, 'server'))
    await fs.ensureDir(path.join(projectPath, 'cms'))
    await fs.ensureDir(path.join(projectPath, 'docs'))

    // Initialize git
    try {
      execFileSync('git', ['init'], { cwd: projectPath, stdio: 'ignore' })
    } catch {
      // Git not available
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
    const versionFile = path.join(workspacePath, '.claude', '.harness-version')
    try {
      if (await fs.pathExists(versionFile)) {
        return (await fs.readFile(versionFile, 'utf-8')).trim()
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

    // Write version marker
    const version = app.getVersion()
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
}
