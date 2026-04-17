import { app, BrowserWindow, ipcMain, Menu, shell, dialog, nativeTheme } from 'electron'
import path from 'path'
import { PtyManager } from './services/PtyManager'
import { WorkspaceManager } from './services/WorkspaceManager'
import { HarnessScanner } from './services/HarnessScanner'

process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()
const workspaceManager = new WorkspaceManager()
const harnessScanner = new HarnessScanner()

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
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
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
  const result = await dialog.showOpenDialog(mainWindow!, {
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
  return harnessScanner.readFile(filePath)
})

ipcMain.handle('harness:getMcpStatus', async (_event, workspacePath: string) => {
  return harnessScanner.getMcpStatus(workspacePath)
})

// ─── IPC Handlers: System ───────────────────────────────────────────

ipcMain.handle('system:openExternal', (_event, url: string) => {
  shell.openExternal(url)
})

ipcMain.handle('system:getHomePath', () => app.getPath('home'))

ipcMain.handle('system:showOpenDialog', async (_event, options: Electron.OpenDialogOptions) => {
  return dialog.showOpenDialog(mainWindow!, options)
})

ipcMain.handle('system:getTheme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light')

ipcMain.handle('system:which', async (_event, cmd: string) => {
  const { execSync } = require('child_process')
  try {
    return execSync(`which ${cmd}`, { encoding: 'utf-8' }).trim()
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
