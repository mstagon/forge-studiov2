import { app, BrowserWindow, ipcMain, Menu, shell, dialog, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PtyManager } from './services/PtyManager'
import { WorkspaceManager } from './services/WorkspaceManager'
import { HarnessScanner } from './services/HarnessScanner'
import { GitManager } from './services/GitManager'
import { UpdateChecker } from './services/UpdateChecker'
import { AgentTeamWatcher } from './services/AgentTeamWatcher'
import { FsManager, type FsListOpts } from './services/FsManager'
import { CodeReviewGraphManager, type InstallMethod } from './services/CodeReviewGraphManager'

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
const gitManager = new GitManager()
const updateChecker = new UpdateChecker()
const agentTeamWatcher = new AgentTeamWatcher()
const fsManager = new FsManager()

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
      // sandbox:false — node-pty가 Node API를 직접 호출해야 하므로 필요 (contextIsolation:true로 보안 유지)
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
    return workspaceManager.create(options)
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
  return workspaceManager.updateHarness({ workspacePath, templatePath, claudeMdPath })
})

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
  return gitManager.commit(cwd, message)
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
  try {
    const { stdout } = await execFileAsync('which', [cmd], { encoding: 'utf-8', timeout: 3000 })
    return stdout.trim()
  } catch {
    return null
  }
})

// ─── IPC Handlers: Updates ──────────────────────────────────────────

ipcMain.handle('updates:check', () => updateChecker.check())

// ─── IPC Handlers: Agent Teams ──────────────────────────────────────

ipcMain.handle('teams:list', () => agentTeamWatcher.list())

ipcMain.handle(
  'teams:setWorkspace',
  async (_event, workspacePath: string | null) => {
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
      members: { agentId: string; task?: string }[]
      worktreeStrategy: 'isolated' | 'shared'
      mergeStrategy: 'squash' | 'sequential'
    }
  ) => {
    return agentTeamWatcher.create(opts)
  }
)

ipcMain.handle('teams:remove', async (_event, teamId: string) => {
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

ipcMain.handle('teams:openAgentTerminal', (_event, options: { teamId: string; agentName: string; cols: number; rows: number }) => {
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

  ptyManager.onData(id, (data) => {
    mainWindow?.webContents.send(`pty:data:${id}`, data)
  })

  ptyManager.onExit(id, (exitCode) => {
    mainWindow?.webContents.send(`pty:exit:${id}`, exitCode)
  })

  return id
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
    buildMenu()
    createWindow()

    agentTeamWatcher.start().catch((err) => {
      console.error('[AgentTeamWatcher] start failed:', err)
    })
    agentTeamWatcher.on('teams', (teams) => {
      mainWindow?.webContents.send('teams:update', teams)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    ptyManager.disposeAll()
    agentTeamWatcher.stop()
    crGraphManager.disposeAll()
    if (process.platform !== 'darwin') app.quit()
  })
}
