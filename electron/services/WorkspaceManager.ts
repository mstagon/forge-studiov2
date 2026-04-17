import fs from 'fs-extra'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { app } from 'electron'

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
      const { execSync } = require('child_process')
      execSync('git init', { cwd: projectPath, stdio: 'ignore' })
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
}
