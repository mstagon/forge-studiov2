import { app, BrowserWindow, ipcMain, Menu, shell, dialog, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PtyManager } from './services/PtyManager'
import { WorkspaceManager } from './services/WorkspaceManager'
import { HarnessScanner } from './services/HarnessScanner'
import { HarnessLinter } from './services/HarnessLinter'
import { PresetManager } from './services/PresetManager'
import { GitManager } from './services/GitManager'
import { UpdateChecker } from './services/UpdateChecker'
import { AgentTeamWatcher } from './services/AgentTeamWatcher'
import { FsManager, type FsListOpts } from './services/FsManager'
import { CodeReviewGraphManager, type InstallMethod } from './services/CodeReviewGraphManager'
import { HookProfiler } from './services/HookProfiler'
import { pathManager } from './services/PathManager'
import { TeamActivityTracker, type ActivityEvent, type MemberSpec } from './services/TeamActivityTracker'
import { ResourceMonitor } from './services/ResourceMonitor'

const execFileAsync = promisify(execFile)

process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()
const crGraphManager = new CodeReviewGraphManager()
const workspaceManager = new WorkspaceManager(crGraphManager)
const harnessScanner = new HarnessScanner()
const harnessLinter = new HarnessLinter()
const presetManager = new PresetManager()
const gitManager = new GitManager()
const updateChecker = new UpdateChecker()
const agentTeamWatcher = new AgentTeamWatcher()
const fsManager = new FsManager()
const hookProfiler = new HookProfiler()
const teamActivityTracker = new TeamActivityTracker()

/**
 * Track which team JSONL streams we've already wired up so the watcher's
 * `teams` event can trigger start/stop without restarting healthy trackers
 * every time the cache emits.
 */
const activityTrackerTeams = new Set<string>()

/**
 * Reconcile the activity tracker against the watcher's authoritative team
 * list. Called on every `teams` emission (boot, workspace switch, create,
 * remove). Without this, only teams created in the current process get a
 * tracker — restored teams from disk show stale JSONL with no live edits.
 */
async function reconcileActivityTrackers(teams: { id: string; members: { agentId: string; name: string; worktreePath?: string; state?: 'active' | 'idle' }[] }[]): Promise<void> {
  const liveIds = new Set(teams.map((t) => t.id))

  for (const teamId of activityTrackerTeams) {
    if (!liveIds.has(teamId)) {
      await teamActivityTracker.stop(teamId).catch(() => {})
      activityTrackerTeams.delete(teamId)
    }
  }

  for (const team of teams) {
    if (activityTrackerTeams.has(team.id)) continue
    const configPath = agentTeamWatcher.configPathFor(team.id)
    if (!configPath) continue
    const memberSpecs: MemberSpec[] = team.members.map((m) => ({
      agentId: m.agentId,
      name: m.name,
      worktreePath: m.worktreePath,
      state: m.state,
    }))
    try {
      await teamActivityTracker.start(team.id, memberSpecs, configPath)
      activityTrackerTeams.add(team.id)
    } catch (err) {
      console.warn(`[teamActivityTracker] start failed for ${team.id} (non-fatal):`, err)
    }
  }
}
/**
 * ResourceMonitor reads the active workspace path lazily so a swap doesn't
 * leave us measuring a stale folder. Disk baseline is reset whenever the
 * workspace pointer moves (see workspaceManager listener below).
 */
let activeWorkspacePathForMetrics: string | null = null
const resourceMonitor = new ResourceMonitor({
  cacheMs: 5000,
  getPtyCount: () => ptyManager.activeCount(),
  getWorkspacePath: () => activeWorkspacePathForMetrics,
})
harnessScanner.setProfiler(hookProfiler)

/**
 * Forward an in-app error to the renderer so the Settings → Error Log view
 * can display it. Best-effort: silently no-ops when the window is gone.
 */
function pushErrorToRenderer(payload: {
  code: string
  category: string
  message: string
  context?: Record<string, unknown>
}): void {
  try {
    mainWindow?.webContents.send('error-log:push', {
      ...payload,
      ts: new Date().toISOString(),
    })
  } catch {
    // ignore — happens during shutdown
  }
}

/**
 * Allowed path prefixes for `fs:listDir` / `fs:readFile`. We always include
 * tracked workspace paths plus the bundled harness template directory (so the
 * renderer can browse harness assets without granting blanket FS access).
 */
function getAllowedFsPrefixes(): string[] {
  const prefixes = workspaceManager.list().map((w) => w.path)
  const templateRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'harness-template')
    : path.resolve(__dirname, '..', 'resources', 'harness-template')
  prefixes.push(templateRoot)
  return prefixes
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      /*
       * sandbox:false — node-pty의 네이티브 바인딩이 preload 시점에 Node API
       * (process, child_process, native module loader)를 호출해야 동작하므로
       * 끄고 있다. 이로 인해 renderer 프로세스는 OS sandbox layer 보호가 빠지지만
       * 다음 두 안전장치로 보안을 유지한다:
       *   1) contextIsolation:true — preload의 Node 권한이 renderer JS에 직접
       *      누설되지 않도록 격리. window.api는 contextBridge 화이트리스트만.
       *   2) nodeIntegration:false — renderer 번들에서 require/process/Buffer
       *      등을 사용할 수 없게 하여 임의의 Node 코드 로딩을 막는다.
       * 추가로 IPC 채널은 preload.ts의 ALLOWED_CHANNELS / 정형 invoke 핸들러로
       * 화이트리스트되며, 모든 fs:/harness: 접근은 workspaceManager의 trusted
       * 경로 prefix 검증을 통과해야 한다.
       */
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[LOAD FAIL] ${errorCode}: ${errorDescription}`)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    ptyManager.disposeAll()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        shell.openExternal(url)
      }
    } catch {
      // Invalid URL, ignore
    }
    return { action: 'deny' }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const distPath = process.env.DIST || path.join(__dirname, '../dist')
    mainWindow.loadFile(path.join(distPath, 'index.html'))
  }
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('navigate', 'settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Workspace', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('action', 'new-workspace') },
        { label: 'Open Workspace', accelerator: 'CmdOrCtrl+O', click: () => handleOpenWorkspace() },
        { type: 'separator' },
        { label: 'New Terminal Tab', accelerator: 'CmdOrCtrl+T', click: () => mainWindow?.webContents.send('action', 'new-tab') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('action', 'toggle-sidebar') },
        { label: 'Toggle Dashboard', accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('action', 'toggle-dashboard') },
        { type: 'separator' },
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow?.webContents.send('action', 'command-palette') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => mainWindow?.webContents.send('action', 'new-tab') },
        { label: 'Split Horizontally', accelerator: 'CmdOrCtrl+Shift+H', click: () => mainWindow?.webContents.send('action', 'split-horizontal') },
        { label: 'Split Vertically', accelerator: 'CmdOrCtrl+Shift+V', click: () => mainWindow?.webContents.send('action', 'split-vertical') },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.send('action', 'terminal-search') },
        { label: 'Clear Buffer', accelerator: 'CmdOrCtrl+K', click: () => mainWindow?.webContents.send('action', 'clear-terminal') },
        { type: 'separator' },
        { label: 'Close Pane', accelerator: 'CmdOrCtrl+W', click: () => mainWindow?.webContents.send('action', 'close-pane') },
        { label: 'Previous Tab', accelerator: 'CmdOrCtrl+Shift+[', click: () => mainWindow?.webContents.send('action', 'prev-tab') },
        { label: 'Next Tab', accelerator: 'CmdOrCtrl+Shift+]', click: () => mainWindow?.webContents.send('action', 'next-tab') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function handleOpenWorkspace() {
  if (!mainWindow) return
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Workspace',
  })
  if (!result.canceled && result.filePaths[0]) {
    mainWindow?.webContents.send('workspace-opened', result.filePaths[0])
  }
}

// ─── IPC Handlers: PTY ──────────────────────────────────────────────

ipcMain.handle('pty:create', (_event, options: { cols: number; rows: number; cwd?: string; shell?: string }) => {
  const id = ptyManager.create({
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd || app.getPath('home'),
    shell: options.shell,
  })

  ptyManager.onData(id, (data) => {
    mainWindow?.webContents.send(`pty:data:${id}`, data)
  })

  ptyManager.onExit(id, (exitCode) => {
    mainWindow?.webContents.send(`pty:exit:${id}`, exitCode)
  })

  return id
})

ipcMain.on('pty:write', (_event, id: string, data: string) => {
  ptyManager.write(id, data)
})

ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
  ptyManager.resize(id, cols, rows)
})

ipcMain.on('pty:dispose', (_event, id: string) => {
  ptyManager.dispose(id)
})

ipcMain.handle('pty:getCwd', (_event, id: string) => {
  return ptyManager.getCwd(id)
})

// ─── IPC Handlers: Workspace ────────────────────────────────────────

ipcMain.handle(
  'workspace:create',
  async (
    _event,
    options: {
      name: string
      path: string
      templatePath?: string
      claudeMdPath?: string
      /**
       * Optional preset id (bundled or user). When supplied, overrides the
       * default `templatePath` / `claudeMdPath` with paths resolved by
       * PresetManager. Empty / unknown ids fall back to the supplied template
       * paths so the renderer can stay loose.
       */
      preset?: string
      splitRepos?: {
        enabled: boolean
        baseName: string
        owner?: string
        protocol?: 'ssh' | 'https'
        autoCreateRepos?: boolean
      }
      crGraph?: { autoBuild?: boolean }
    }
  ) => {
    try {
      let templatePath = options.templatePath
      let claudeMdPath = options.claudeMdPath
      if (options.preset) {
        const preset = await presetManager.findPreset(options.preset)
        if (preset) {
          templatePath = preset.templatePath
          claudeMdPath = preset.claudeMdPath ?? claudeMdPath
        }
      }
      return await workspaceManager.create({
        ...options,
        templatePath,
        claudeMdPath,
      })
    } catch (err) {
      pushErrorToRenderer({
        code: 'IPC_INVALID_PAYLOAD',
        category: 'IPC',
        message: err instanceof Error ? err.message : String(err),
        context: { handler: 'workspace:create', name: options?.name, path: options?.path },
      })
      throw err
    }
  }
)

ipcMain.handle('workspace:open', async (_event, dirPath: string) => {
  return workspaceManager.open(dirPath)
})

ipcMain.handle('workspace:list', () => {
  return workspaceManager.list()
})

ipcMain.handle('workspace:remove', (_event, id: string) => {
  return workspaceManager.remove(id)
})

ipcMain.handle('workspace:getTemplatePath', () => {
  if (app.isPackaged) {
    // Packaged: harness template bundled in resources/
    return path.join(process.resourcesPath, 'harness-template', '.claude')
  }
  // Dev: template lives under resources/harness-template at the repo root.
  // __dirname is <repo>/dist-electron in dev, so step up once.
  return path.resolve(__dirname, '..', 'resources', 'harness-template', '.claude')
})

ipcMain.handle('workspace:getClaudeMdPath', () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'harness-template', 'CLAUDE.md')
  }
  return path.resolve(__dirname, '..', 'resources', 'harness-template', 'CLAUDE.md')
})

// ─── IPC Handlers: Harness Scanner ──────────────────────────────────

ipcMain.handle('harness:scan', async (_event, workspacePath: string) => {
  return harnessScanner.scan(workspacePath)
})

ipcMain.handle('harness:readFile', async (_event, filePath: string) => {
  if (!filePath || typeof filePath !== 'string') return ''
  // Resolve symlinks to prevent symlink traversal attacks
  let realPath: string
  try {
    realPath = fs.realpathSync(path.resolve(filePath))
  } catch {
    return ''
  }
  // Only allow reading files within workspace .claude directories
  const allWorkspaces = workspaceManager.list()
  const isAllowed = allWorkspaces.some((ws) => {
    try {
      const claudeDir = fs.realpathSync(path.resolve(ws.path, '.claude'))
      return realPath.startsWith(claudeDir + path.sep) || realPath === claudeDir
    } catch {
      return false
    }
  })
  if (!isAllowed) {
    throw new Error('Access denied: path must be within a workspace .claude directory')
  }
  return harnessScanner.readFile(realPath)
})

ipcMain.handle('harness:getMcpStatus', async (_event, workspacePath: string) => {
  return harnessScanner.getMcpStatus(workspacePath)
})

ipcMain.handle('harness:listAgents', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') return []
  return harnessScanner.listAgents(workspacePath)
})

ipcMain.handle('harness:listSkills', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') return []
  return harnessScanner.listSkills(workspacePath)
})

ipcMain.handle('harness:listCommands', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') return []
  return harnessScanner.listCommands(workspacePath)
})

ipcMain.handle('harness:listHooks', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') return []
  return harnessScanner.listHooks(workspacePath)
})

ipcMain.handle('harness:listCompositions', async () => {
  return harnessScanner.listCompositions()
})

ipcMain.handle('harness:getBundledVersion', () => app.getVersion())

ipcMain.handle('harness:getInstalledVersion', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') return null
  return workspaceManager.getInstalledVersion(workspacePath)
})

ipcMain.handle('harness:update', async (_event, workspacePath: string) => {
  try {
    if (!workspacePath || typeof workspacePath !== 'string') {
      throw new Error('workspacePath is required')
    }
    // Verify the workspace is one we track to avoid arbitrary FS writes
    const tracked = workspaceManager.list().some((w) => w.path === workspacePath)
    if (!tracked) {
      throw new Error('Workspace is not tracked by Forge Studio')
    }
    const templatePath = app.isPackaged
      ? path.join(process.resourcesPath, 'harness-template', '.claude')
      : path.resolve(__dirname, '..', 'resources', 'harness-template', '.claude')
    const claudeMdPath = app.isPackaged
      ? path.join(process.resourcesPath, 'harness-template', 'CLAUDE.md')
      : path.resolve(__dirname, '..', 'resources', 'harness-template', 'CLAUDE.md')
    return await workspaceManager.updateHarness({ workspacePath, templatePath, claudeMdPath })
  } catch (err) {
    pushErrorToRenderer({
      code: 'FS_WRITE_FAILED',
      category: 'FS',
      message: err instanceof Error ? err.message : String(err),
      context: { handler: 'harness:update', workspacePath },
    })
    throw err
  }
})

/** Resolve the active bundled `.claude/` template path for the running build. */
function getBundledTemplatePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'harness-template', '.claude')
    : path.resolve(__dirname, '..', 'resources', 'harness-template', '.claude')
}

ipcMain.handle('harness:lint', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') {
    throw new Error('workspacePath is required')
  }
  return harnessLinter.lint(workspacePath)
})

ipcMain.handle('harness:previewUpdate', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') {
    throw new Error('workspacePath is required')
  }
  // Anyone wiring this from the renderer should already be in a tracked
  // workspace; treat the call as read-only and skip the strict tracked check.
  const templatePath = getBundledTemplatePath()
  return workspaceManager.previewHarnessUpdate({ workspacePath, templatePath })
})

ipcMain.handle('harness:previewSessionContext', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') {
    throw new Error('workspacePath is required')
  }
  return harnessScanner.previewSessionContext(workspacePath)
})

// ─── IPC Handlers: Presets ──────────────────────────────────────────

ipcMain.handle('preset:list', async () => {
  return presetManager.listPresets()
})

ipcMain.handle('preset:apply', async (_event, workspacePath: string, presetId: string) => {
  assertTrackedWorkspace(workspacePath)
  if (!presetId || typeof presetId !== 'string') {
    throw new Error('presetId is required')
  }
  return presetManager.applyPreset(workspacePath, presetId)
})

ipcMain.handle(
  'preset:save',
  async (
    _event,
    workspacePath: string,
    options: { id: string; name?: string; description?: string }
  ) => {
    assertTrackedWorkspace(workspacePath)
    if (!options?.id) throw new Error('preset id is required')
    return presetManager.saveAsPreset({
      workspacePath,
      id: options.id,
      name: options.name,
      description: options.description,
    })
  }
)

ipcMain.handle('preset:delete', async (_event, presetId: string) => {
  if (!presetId || typeof presetId !== 'string') {
    throw new Error('presetId is required')
  }
  return presetManager.deletePreset(presetId)
})

// ─── IPC Handlers: Harness Authoring (CRUD) ─────────────────────────
//
// All authoring writes are gated by `assertTrackedWorkspace` — the renderer
// can only mutate `.claude/...` inside a workspace we already track. The
// scanner's per-method `assertClaudeChild` enforces traversal containment.

function assertTrackedWorkspace(wsPath: string): void {
  if (!wsPath || typeof wsPath !== 'string') {
    throw new Error('workspacePath is required')
  }
  const tracked = workspaceManager.list().some((w) => w.path === wsPath)
  if (!tracked) {
    throw new Error('Workspace is not tracked by Forge Studio')
  }
}

// Agents

ipcMain.handle(
  'harness:createAgent',
  async (
    _event,
    workspacePath: string,
    opts: { name: string; description?: string; tools?: string; model?: string; body?: string }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.createAgent(workspacePath, opts)
  }
)

ipcMain.handle(
  'harness:updateAgent',
  async (_event, workspacePath: string, name: string, body: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.updateAgent(workspacePath, name, body)
  }
)

ipcMain.handle(
  'harness:deleteAgent',
  async (_event, workspacePath: string, name: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.deleteAgent(workspacePath, name)
  }
)

ipcMain.handle(
  'harness:renameAgent',
  async (_event, workspacePath: string, oldName: string, newName: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.renameAgent(workspacePath, oldName, newName)
  }
)

// Skills

ipcMain.handle(
  'harness:createSkill',
  async (
    _event,
    workspacePath: string,
    opts: { name: string; description?: string; globs?: string; body?: string }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.createSkill(workspacePath, opts)
  }
)

ipcMain.handle(
  'harness:updateSkill',
  async (_event, workspacePath: string, name: string, body: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.updateSkill(workspacePath, name, body)
  }
)

ipcMain.handle(
  'harness:deleteSkill',
  async (_event, workspacePath: string, name: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.deleteSkill(workspacePath, name)
  }
)

ipcMain.handle(
  'harness:renameSkill',
  async (_event, workspacePath: string, oldName: string, newName: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.renameSkill(workspacePath, oldName, newName)
  }
)

// Commands

ipcMain.handle(
  'harness:createCommand',
  async (
    _event,
    workspacePath: string,
    opts: { name: string; description?: string; argHint?: string; body?: string }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.createCommand(workspacePath, opts)
  }
)

ipcMain.handle(
  'harness:updateCommand',
  async (_event, workspacePath: string, name: string, body: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.updateCommand(workspacePath, name, body)
  }
)

ipcMain.handle(
  'harness:deleteCommand',
  async (_event, workspacePath: string, name: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.deleteCommand(workspacePath, name)
  }
)

ipcMain.handle(
  'harness:renameCommand',
  async (_event, workspacePath: string, oldName: string, newName: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.renameCommand(workspacePath, oldName, newName)
  }
)

// Hooks

ipcMain.handle(
  'harness:addHook',
  async (
    _event,
    workspacePath: string,
    event: string,
    hook: { matcher?: string; command: string; type?: string; timeout?: number; disabled?: boolean }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.addHook(workspacePath, event, hook)
  }
)

ipcMain.handle(
  'harness:removeHook',
  async (_event, workspacePath: string, event: string, index: number) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.removeHook(workspacePath, event, index)
  }
)

ipcMain.handle(
  'harness:updateHook',
  async (
    _event,
    workspacePath: string,
    event: string,
    index: number,
    hook: { matcher?: string; command: string; type?: string; timeout?: number; disabled?: boolean }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.updateHook(workspacePath, event, index, hook)
  }
)

// MCP Servers

ipcMain.handle('harness:listMcpServers', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') return []
  return harnessScanner.listMcpServers(workspacePath)
})

ipcMain.handle(
  'harness:addMcpServer',
  async (
    _event,
    workspacePath: string,
    name: string,
    spec: {
      command?: string
      args?: string[]
      env?: Record<string, string>
      type?: 'stdio' | 'http' | 'sse'
      url?: string
      disabled?: boolean
    }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.addMcpServer(workspacePath, name, spec)
  }
)

ipcMain.handle(
  'harness:updateMcpServer',
  async (
    _event,
    workspacePath: string,
    name: string,
    spec: {
      command?: string
      args?: string[]
      env?: Record<string, string>
      type?: 'stdio' | 'http' | 'sse'
      url?: string
      disabled?: boolean
    }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.updateMcpServer(workspacePath, name, spec)
  }
)

ipcMain.handle(
  'harness:removeMcpServer',
  async (_event, workspacePath: string, name: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.removeMcpServer(workspacePath, name)
  }
)

ipcMain.handle(
  'harness:testMcpConnection',
  async (_event, workspacePath: string, name: string) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.testMcpConnection(workspacePath, name)
  }
)

// Permissions

ipcMain.handle('harness:getPermissions', async (_event, workspacePath: string) => {
  if (!workspacePath || typeof workspacePath !== 'string') {
    return { allow: [], deny: [] }
  }
  return harnessScanner.getPermissions(workspacePath)
})

ipcMain.handle(
  'harness:setPermissions',
  async (
    _event,
    workspacePath: string,
    next: { allow: string[]; deny: string[] }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.setPermissions(workspacePath, next)
  }
)

// CLAUDE.md routing sync

ipcMain.handle(
  'harness:syncRouting',
  async (
    _event,
    workspacePath: string,
    kind: 'agent' | 'skill',
    entry: { name: string; description?: string; pattern?: string }
  ) => {
    assertTrackedWorkspace(workspacePath)
    return harnessScanner.syncRoutingTable(workspacePath, kind, entry)
  }
)

// ─── IPC Handlers: code-review-graph ───────────────────────────────

ipcMain.handle('cr-graph:isInstalled', () => crGraphManager.isInstalled())

ipcMain.handle('cr-graph:install', (_event, method?: InstallMethod) =>
  crGraphManager.install(method)
)

ipcMain.handle('cr-graph:build', (_event, workspacePath: string) =>
  crGraphManager.build(workspacePath)
)

ipcMain.handle('cr-graph:stats', (_event, workspacePath: string) =>
  crGraphManager.stats(workspacePath)
)

ipcMain.handle('cr-graph:vizStart', (_event, workspacePath: string) =>
  crGraphManager.vizUrl(workspacePath)
)

ipcMain.handle('cr-graph:vizStop', (_event, pid: number) => {
  crGraphManager.stopViz(pid)
  return true
})

// ─── IPC Handlers: Git ─────────────────────────────────────────────

ipcMain.handle('git:status', async (_event, cwd: string) => {
  return gitManager.getStatus(cwd)
})

ipcMain.handle('git:log', async (_event, cwd: string, limit?: number) => {
  return gitManager.getLog(cwd, limit)
})

ipcMain.handle('git:branches', async (_event, cwd: string) => {
  return gitManager.getBranches(cwd)
})

ipcMain.handle('git:stage', async (_event, cwd: string, files: string[]) => {
  await gitManager.stage(cwd, files)
})

ipcMain.handle('git:stageAll', async (_event, cwd: string) => {
  await gitManager.stageAll(cwd)
})

ipcMain.handle('git:unstage', async (_event, cwd: string, files: string[]) => {
  await gitManager.unstage(cwd, files)
})

ipcMain.handle('git:unstageAll', async (_event, cwd: string) => {
  await gitManager.unstageAll(cwd)
})

ipcMain.handle('git:commit', async (_event, cwd: string, message: string) => {
  try {
    return await gitManager.commit(cwd, message)
  } catch (err) {
    pushErrorToRenderer({
      code: 'GIT_COMMAND_FAILED',
      category: 'GIT',
      message: err instanceof Error ? err.message : String(err),
      context: { handler: 'git:commit', cwd },
    })
    throw err
  }
})

ipcMain.handle('git:push', async (_event, cwd: string) => {
  return gitManager.push(cwd)
})

ipcMain.handle('git:pull', async (_event, cwd: string) => {
  return gitManager.pull(cwd)
})

ipcMain.handle('git:fetch', async (_event, cwd: string) => {
  return gitManager.fetch(cwd)
})

ipcMain.handle('git:checkout', async (_event, cwd: string, branch: string) => {
  await gitManager.checkout(cwd, branch)
})

ipcMain.handle('git:createBranch', async (_event, cwd: string, name: string) => {
  await gitManager.createBranch(cwd, name)
})

ipcMain.handle('git:deleteBranch', async (_event, cwd: string, name: string) => {
  await gitManager.deleteBranch(cwd, name)
})

ipcMain.handle('git:diff', async (_event, cwd: string, file: string, staged: boolean) => {
  return gitManager.getDiff(cwd, file, staged)
})

ipcMain.handle('git:commitDiff', async (_event, cwd: string, hash: string) => {
  return gitManager.getCommitDiff(cwd, hash)
})

ipcMain.handle('git:commitFiles', async (_event, cwd: string, hash: string) => {
  return gitManager.getCommitFiles(cwd, hash)
})

ipcMain.handle('git:discard', async (_event, cwd: string, file: string) => {
  await gitManager.discard(cwd, file)
})

ipcMain.handle('git:remotes', async (_event, cwd: string) => {
  return gitManager.getRemotes(cwd)
})

// ─── IPC Handlers: Filesystem ───────────────────────────────────────

ipcMain.handle('fs:listDir', async (_event, absPath: string, opts?: FsListOpts) => {
  return fsManager.listDir(absPath, opts ?? {}, getAllowedFsPrefixes())
})

ipcMain.handle('fs:readFile', async (_event, absPath: string, maxBytes?: number) => {
  return fsManager.readFile(absPath, maxBytes ?? 256 * 1024, getAllowedFsPrefixes())
})

// ─── IPC Handlers: System ───────────────────────────────────────────

ipcMain.handle('system:openExternal', (_event, url: string) => {
  if (!url || typeof url !== 'string') return
  try {
    const parsed = new URL(url)
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      shell.openExternal(url)
    }
  } catch {
    // Invalid URL, ignore
  }
})

ipcMain.handle('system:getHomePath', () => app.getPath('home'))

ipcMain.handle('system:showOpenDialog', async (_event, options: Electron.OpenDialogOptions) => {
  if (!mainWindow) throw new Error('No active window')
  return dialog.showOpenDialog(mainWindow, options)
})

ipcMain.handle('system:getTheme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light')

ipcMain.handle('system:which', async (_event, cmd: string) => {
  if (!cmd || typeof cmd !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(cmd)) {
    return null
  }
  // Bundled tools take priority over PATH lookup so the onboarding "where is
  // tmux?" probe always points at the DMG-shipped binary on a default install.
  // Otherwise a user with their own homebrew tmux would resolve there even
  // though every internal spawn uses the bundled path.
  if (cmd === 'tmux') {
    const bundled = pathManager.getTmux()
    if (bundled) return bundled
  } else if (cmd === 'uv') {
    const bundled = pathManager.getUv()
    if (bundled) return bundled
  } else if (cmd === 'code-review-graph') {
    const bundled = pathManager.getCrGraphCli()
    if (bundled) return bundled
  } else if (cmd === 'python3' || cmd === 'python3.12') {
    const bundled = pathManager.getPython()
    if (bundled) return bundled
  }
  try {
    const { stdout } = await execFileAsync('which', [cmd], {
      encoding: 'utf-8',
      timeout: 3000,
      env: pathManager.augmentEnv({ ...process.env }),
    })
    return stdout.trim()
  } catch {
    return null
  }
})

/**
 * Surface the absolute path of the bundled-tools root so the renderer can
 * detect whether a resolved binary was shipped inside the DMG. Returns null
 * when no bundle is present (dev tree without `npm run bundle:tools` or a
 * non-arm64 build).
 */
ipcMain.handle('system:bundledToolsRoot', () => pathManager.getBundledToolsRoot())

// ─── IPC Handlers: Updates ──────────────────────────────────────────

ipcMain.handle('updates:check', () => updateChecker.check())

// ─── IPC Handlers: Hook Profiler ────────────────────────────────────

ipcMain.handle('hook-profiler:recent', (_event, limit?: number) =>
  hookProfiler.getRecent(typeof limit === 'number' ? limit : 100)
)

ipcMain.handle('hook-profiler:stats', (_event, window?: number) =>
  hookProfiler.getStats(typeof window === 'number' ? window : undefined)
)

ipcMain.handle(
  'hook-profiler:record',
  (
    _event,
    payload: {
      event: string
      script: string
      durationMs: number
      exitCode: number
      output?: string
    }
  ) => {
    return hookProfiler.recordExecution(payload)
  }
)

// ─── IPC Handlers: Error Log (renderer-pushed) ─────────────────────
//
// The renderer also surfaces errors that originate in main (timeouts,
// FS denials, etc.). For renderer-side errors we don't need a handler —
// they're recorded directly in the zustand store. But IPC failures from
// here propagate to renderers via webContents.send('error-log:push'),
// which is a one-way channel routed through preload.

ipcMain.on(
  'error-log:report',
  (_event, payload: { code: string; category: string; message: string; context?: Record<string, unknown> }) => {
    pushErrorToRenderer(payload)
  }
)

// ─── IPC Handlers: Agent Teams ──────────────────────────────────────

ipcMain.handle('teams:list', () => agentTeamWatcher.list())

ipcMain.handle(
  'teams:setWorkspace',
  async (_event, workspacePath: string | null) => {
    // Track the active workspace so ResourceMonitor measures the right
    // directory for `du` baseline. Switching workspaces resets the baseline
    // so the bar doesn't show a phantom "free GB" bump.
    if (activeWorkspacePathForMetrics !== workspacePath) {
      activeWorkspacePathForMetrics = workspacePath
      resourceMonitor.resetDiskBaseline()
    }
    await agentTeamWatcher.setWorkspace(workspacePath)
  }
)

ipcMain.handle(
  'teams:create',
  async (
    _event,
    opts: {
      workspaceId: string
      workspacePath: string
      name: string
      goal?: string
      members: { agentId: string; task?: string; model?: string }[]
      worktreeStrategy: 'isolated' | 'shared'
      mergeStrategy: 'squash' | 'sequential'
      council?: boolean
    }
  ) => {
    const result = await agentTeamWatcher.create(opts)
    // Spin up the activity tracker for the brand-new team. The watcher's
    // create() already wrote config.json + worktrees + emitted 'teams',
    // which triggered reconcileActivityTrackers — so this is normally a no-op.
    // We keep the explicit start as a synchronous guarantee that the tracker
    // is alive before the IPC returns (reconcile is fire-and-forget).
    try {
      const teams = agentTeamWatcher.list()
      const team = teams.find((t) => t.id === result.teamId)
      if (team && !activityTrackerTeams.has(team.id)) {
        const memberSpecs: MemberSpec[] = team.members.map((m) => ({
          agentId: m.agentId,
          name: m.name,
          worktreePath: m.worktreePath,
          state: m.state,
        }))
        await teamActivityTracker.start(result.teamId, memberSpecs, result.configPath)
        activityTrackerTeams.add(result.teamId)
      }
    } catch (err) {
      console.warn('[teamActivityTracker] start failed (non-fatal):', err)
    }
    return result
  }
)

ipcMain.handle('teams:remove', async (_event, teamId: string) => {
  // Tear down activity tracking before the watcher rm's the team config so
  // the JSONL stream flushes its tail line cleanly. The watcher's remove()
  // emits 'teams' afterward, which lets reconcile handle any leftovers.
  await teamActivityTracker.stop(teamId).catch(() => {})
  activityTrackerTeams.delete(teamId)
  await agentTeamWatcher.remove(teamId)
})

ipcMain.handle('teams:pause', async (_event, teamId: string) => {
  return agentTeamWatcher.pause(teamId)
})

ipcMain.handle('teams:resume', async (_event, teamId: string) => {
  return agentTeamWatcher.resume(teamId)
})

ipcMain.handle('teams:pauseMember', async (_event, teamId: string, agentId: string) => {
  return agentTeamWatcher.pauseMember(teamId, agentId)
})

ipcMain.handle('teams:resumeMember', async (_event, teamId: string, agentId: string) => {
  return agentTeamWatcher.resumeMember(teamId, agentId)
})

ipcMain.handle(
  'teams:merge',
  async (_event, teamId: string, opts?: { mergeStrategy?: 'squash' | 'sequential' }) => {
    return agentTeamWatcher.merge(teamId, opts ?? {})
  }
)

/**
 * Cache of agent-terminal PTYs keyed by `${teamId}:${agentName}`.
 *
 * Why cache: previously every renderer-side mount of <XTerminal> for an agent
 * called this handler, which always spawned a fresh `tmux attach` PTY. The
 * old PTY's master fd would eventually close (component unmount, cleanup),
 * sending SIGHUP through tmux to the pane's `claude` process — exactly the
 * "다른 화면 갔다오면 claude 꺼짐" regression. Even with our v0.6.3 portal
 * lift + cleanup-skip, transient remounts still produced new attach clients
 * with their own empty xterm buffers (= "터미널 내부 내용 전부 초기화됨").
 *
 * With this cache, the SAME ptyId is returned for the same (teamId, agentName),
 * so the renderer reuses the same data stream. The cache entry is cleared
 * automatically on PTY exit (process death) or when the team is removed.
 */
const agentPtyCache = new Map<string, string>()

function agentPtyKey(teamId: string, agentName: string): string {
  return `${teamId}:${agentName}`
}

ipcMain.handle('teams:openAgentTerminal', (_event, options: { teamId: string; agentName: string; cols: number; rows: number }) => {
  const cacheKey = agentPtyKey(options.teamId, options.agentName)
  const cached = agentPtyCache.get(cacheKey)
  if (cached) {
    // Reuse the existing PTY. The renderer re-subscribes to data/exit events
    // on its own (window.api.pty.onData/onExit), so we don't need to re-wire
    // the bridge here. Returning the same id keeps the tmux attach client
    // alive across <XTerminal> remounts — no new SIGHUP, no buffer reset.
    return cached
  }

  const teams = agentTeamWatcher.list()
  const team = teams.find((t) => t.id === options.teamId)
  if (!team) throw new Error(`Team not found: ${options.teamId}`)
  const member = team.members.find((m) => m.name === options.agentName)
  if (!member) throw new Error(`Member not found: ${options.agentName}`)
  if (!member.tmuxPaneId) {
    throw new Error(`Agent ${options.agentName} has no tmux pane (backend may not be tmux)`)
  }

  const id = ptyManager.createTmuxAttach({
    cols: options.cols,
    rows: options.rows,
    paneId: member.tmuxPaneId,
  })
  agentPtyCache.set(cacheKey, id)

  ptyManager.onData(id, (data) => {
    mainWindow?.webContents.send(`pty:data:${id}`, data)
  })

  ptyManager.onExit(id, (exitCode) => {
    // The PTY died (claude exit, tmux session kill, manual dispose). Clear
    // the cache so the next openAgentTerminal call provisions a fresh attach.
    agentPtyCache.delete(cacheKey)
    mainWindow?.webContents.send(`pty:exit:${id}`, exitCode)
  })

  return id
})

// ─── IPC Handlers: Inbox (member ↔ member 메시지) ───────────────────

ipcMain.handle('teams:sendMessage', async (_event, opts: { teamId: string; fromAgent: string; toAgent: string; text: string; summary?: string }) => {
  const ws = workspaceManager.getActive()
  return agentTeamWatcher.sendInboxMessage(
    ws?.path ?? null,
    opts.teamId,
    opts.fromAgent,
    opts.toAgent,
    opts.text,
    opts.summary,
  )
})

ipcMain.handle('teams:readInbox', async (_event, opts: { teamId: string; agentName: string }) => {
  const ws = workspaceManager.getActive()
  return agentTeamWatcher.readInbox(ws?.path ?? null, opts.teamId, opts.agentName)
})

ipcMain.handle('teams:markInboxRead', async (_event, opts: { teamId: string; agentName: string }) => {
  const ws = workspaceManager.getActive()
  return agentTeamWatcher.markInboxRead(ws?.path ?? null, opts.teamId, opts.agentName)
})

ipcMain.handle('teams:detectConflicts', async (_event, opts: { teamId: string }) => {
  const ws = workspaceManager.getActive()
  return agentTeamWatcher.detectMemberConflicts(ws?.path ?? null, opts.teamId)
})

// ─── IPC Handlers: Integrations / .env tokens ───────────────────────
//
// 워크스페이스의 .env 파일에 토큰 KEY=VALUE upsert. Integrations
// (GitHub/Linear/Sentry) 토큰을 GUI 에서 입력 → forge-team CLI 가 spawn 하는
// 멤버 process 의 env 에 자동 propagate. Forge 자체는 토큰 안 봄 — 멤버
// claude/codex 가 .env 읽고 사용.
//
// 보안:
//   - .env 가 .gitignore 에 있는지 확인 후 없으면 추가 (실수 commit 방지)
//   - 값 자체는 disk 에 plain text — macOS keychain 은 v0.9.1+ (별도 backend)

ipcMain.handle('settings:saveEnvVar', async (_event, opts: { workspacePath: string; key: string; value: string }) => {
  if (!opts.workspacePath || !opts.key) {
    return { ok: false, error: 'workspacePath + key required' }
  }
  // 보안 — KEY 형식 검증 (영숫자 + _, 사용자 입력으로 path traversal 못 하게)
  if (!/^[A-Z][A-Z0-9_]*$/.test(opts.key)) {
    return { ok: false, error: 'KEY must be UPPERCASE_SNAKE_CASE' }
  }
  try {
    const fsPromises = await import('fs/promises')
    const envPath = path.join(opts.workspacePath, '.env')
    let existing = ''
    try {
      existing = await fsPromises.readFile(envPath, 'utf-8')
    } catch {
      // 첫 작성 — 빈 .env
    }
    const lines = existing.split('\n')
    const keyPrefix = `${opts.key}=`
    const idx = lines.findIndex((l) => l.startsWith(keyPrefix))
    const newLine = `${opts.key}=${opts.value}`
    if (idx >= 0) {
      lines[idx] = newLine
    } else {
      // 끝에 빈 줄 있으면 그 자리에, 없으면 append + newline
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
      lines.push(newLine, '')
    }
    await fsPromises.writeFile(envPath, lines.join('\n'), 'utf-8')

    // .gitignore 에 .env 등록 보장 (없으면 append)
    const gitignorePath = path.join(opts.workspacePath, '.gitignore')
    let gitignore = ''
    try {
      gitignore = await fsPromises.readFile(gitignorePath, 'utf-8')
    } catch {
      // 없으면 새로
    }
    if (!gitignore.split('\n').some((l) => l.trim() === '.env' || l.trim() === '.env.*' || l.trim() === '.env*')) {
      const sep = gitignore.length > 0 && !gitignore.endsWith('\n') ? '\n' : ''
      await fsPromises.writeFile(gitignorePath, `${gitignore}${sep}.env\n`, 'utf-8')
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

ipcMain.handle('settings:readEnvKeys', async (_event, opts: { workspacePath: string }) => {
  if (!opts.workspacePath) return [] as string[]
  try {
    const fsPromises = await import('fs/promises')
    const buf = await fsPromises.readFile(path.join(opts.workspacePath, '.env'), 'utf-8')
    return buf
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => l.split('=')[0])
  } catch {
    return [] as string[]
  }
})

ipcMain.handle('settings:removeEnvVar', async (_event, opts: { workspacePath: string; key: string }) => {
  if (!opts.workspacePath || !opts.key) return { ok: false, error: 'workspacePath + key required' }
  try {
    const fsPromises = await import('fs/promises')
    const envPath = path.join(opts.workspacePath, '.env')
    let existing = ''
    try {
      existing = await fsPromises.readFile(envPath, 'utf-8')
    } catch {
      return { ok: true } // 파일 없으면 이미 삭제 상태
    }
    const lines = existing.split('\n').filter((l) => !l.startsWith(`${opts.key}=`))
    await fsPromises.writeFile(envPath, lines.join('\n'), 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

// ─── IPC Handlers: Team Activity ────────────────────────────────────

ipcMain.handle('team-activity:list', async (_event, teamId: string, limit?: number) => {
  if (!teamId || typeof teamId !== 'string') return []
  const cap = typeof limit === 'number' && limit > 0 ? Math.min(limit, 1000) : 100
  return teamActivityTracker.list(teamId, cap)
})

// ─── IPC Handlers: Resource Snapshot ────────────────────────────────

ipcMain.handle('resource:snapshot', async () => {
  try {
    return await resourceMonitor.getSnapshot()
  } catch (err) {
    pushErrorToRenderer({
      code: 'RESOURCE_SNAPSHOT_FAILED',
      category: 'SYSTEM',
      message: err instanceof Error ? err.message : String(err),
    })
    // Always return a well-formed snapshot so the renderer never has to
    // defend against rejection — the bar just shows zeros until the next
    // poll succeeds.
    return {
      cpu: 0,
      memUsed: 0,
      memTotal: 0,
      diskDeltaGb: 0,
      ptyCount: 0,
      ts: Date.now(),
    }
  }
})

// ─── App Lifecycle ──────────────────────────────────────────────────

// Single instance lock — guarantees only one Electron main process creates
// BrowserWindows. Without this, `npm run electron:dev` could spawn a second
// window if both vite-plugin-electron and a stray `electron .` launch.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Another instance tried to start — focus the existing window instead.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // Proactively repair the bundled cr-graph venv before any UI surface
    // tries to spawn `code-review-graph`. Older Forge builds shipped a venv
    // whose `bin/python` symlink and console-script polyglot exec line were
    // baked with absolute build-host paths — both die inside the DMG. The
    // repair is idempotent and gated by a per-version flag file so it
    // costs effectively nothing after the first launch.
    try {
      const repaired = pathManager.ensureVenvUsable()
      if (repaired) {
        console.log('[main] cr-graph venv repaired (absolute paths -> relative)')
      }
    } catch (err) {
      console.warn('[main] ensureVenvUsable failed (non-fatal):', err)
    }

    buildMenu()
    createWindow()

    // Forward non-zero hook exits to the in-app error log so users notice
    // recurring hook failures without diving into the JSONL file.
    hookProfiler.on('record', (record) => {
      if (record.exitCode !== 0) {
        pushErrorToRenderer({
          code: 'HOOK_NON_ZERO_EXIT',
          category: 'HOOK',
          message: `${record.script} exited ${record.exitCode} (${record.durationMs}ms)`,
          context: {
            event: record.event,
            script: record.script,
            exitCode: record.exitCode,
            durationMs: record.durationMs,
          },
        })
      }
    })

    agentTeamWatcher.start().catch((err) => {
      console.error('[AgentTeamWatcher] start failed:', err)
    })
    agentTeamWatcher.on('teams', (teams) => {
      mainWindow?.webContents.send('teams:update', teams)
      reconcileActivityTrackers(teams).catch((err) => {
        console.warn('[teamActivityTracker] reconcile failed (non-fatal):', err)
      })
    })

    // Forward every activity event to the renderer. The renderer subscribes
    // via `team-activity:event` (single channel for all teams) and filters by
    // teamId in the store — keeps preload simpler than fanning out
    // per-team channels.
    teamActivityTracker.on('event', (event: ActivityEvent) => {
      mainWindow?.webContents.send('team-activity:event', event)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    ptyManager.disposeAll()
    agentTeamWatcher.stop()
    teamActivityTracker.stopAll().catch(() => {})
    crGraphManager.disposeAll()
    if (process.platform !== 'darwin') app.quit()
  })
}
