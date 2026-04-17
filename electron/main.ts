import { app, BrowserWindow, ipcMain, Menu, shell, dialog, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PtyManager } from './services/PtyManager'
import { WorkspaceManager } from './services/WorkspaceManager'
import { HarnessScanner } from './services/HarnessScanner'
import { GitManager } from './services/GitManager'

const execFileAsync = promisify(execFile)

process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()
const workspaceManager = new WorkspaceManager()
const harnessScanner = new HarnessScanner()
const gitManager = new GitManager()

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

ipcMain.handle('workspace:create', async (_event, options: { name: string; path: string; templatePath?: string; claudeMdPath?: string }) => {
  return workspaceManager.create(options)
})

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
  // Dev: harness is in parent directory
  const harnessRoot = path.resolve(__dirname, '../..')
  return path.join(harnessRoot, '.claude')
})

ipcMain.handle('workspace:getClaudeMdPath', () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'harness-template', 'CLAUDE.md')
  }
  return path.resolve(__dirname, '../../CLAUDE.md')
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

// ─── App Lifecycle ──────────────────────────────────────────────────

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptyManager.disposeAll()
  if (process.platform !== 'darwin') app.quit()
})
