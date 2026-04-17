import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // ─── PTY ─────────────────────────────────────────────────────────
  pty: {
    create: (options: { cols: number; rows: number; cwd?: string; shell?: string }) =>
      ipcRenderer.invoke('pty:create', options),
    write: (id: string, data: string) =>
      ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    dispose: (id: string) =>
      ipcRenderer.send('pty:dispose', id),
    getCwd: (id: string) =>
      ipcRenderer.invoke('pty:getCwd', id),
    onData: (id: string, callback: (data: string) => void) => {
      const handler = (_event: any, data: string) => callback(data)
      ipcRenderer.on(`pty:data:${id}`, handler)
      return () => ipcRenderer.removeListener(`pty:data:${id}`, handler)
    },
    onExit: (id: string, callback: (exitCode: number) => void) => {
      const handler = (_event: any, exitCode: number) => callback(exitCode)
      ipcRenderer.on(`pty:exit:${id}`, handler)
      return () => ipcRenderer.removeListener(`pty:exit:${id}`, handler)
    },
  },

  // ─── Workspace ───────────────────────────────────────────────────
  workspace: {
    create: (options: { name: string; path: string; templatePath?: string; claudeMdPath?: string }) =>
      ipcRenderer.invoke('workspace:create', options),
    open: (dirPath: string) =>
      ipcRenderer.invoke('workspace:open', dirPath),
    list: () =>
      ipcRenderer.invoke('workspace:list'),
    remove: (id: string) =>
      ipcRenderer.invoke('workspace:remove', id),
    getTemplatePath: () =>
      ipcRenderer.invoke('workspace:getTemplatePath'),
    getClaudeMdPath: () =>
      ipcRenderer.invoke('workspace:getClaudeMdPath'),
  },

  // ─── Harness ─────────────────────────────────────────────────────
  harness: {
    scan: (workspacePath: string) =>
      ipcRenderer.invoke('harness:scan', workspacePath),
    readFile: (filePath: string) =>
      ipcRenderer.invoke('harness:readFile', filePath),
    getMcpStatus: (workspacePath: string) =>
      ipcRenderer.invoke('harness:getMcpStatus', workspacePath),
  },

  // ─── Git ─────────────────────────────────────────────────────────
  git: {
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    log: (cwd: string, limit?: number) => ipcRenderer.invoke('git:log', cwd, limit),
    branches: (cwd: string) => ipcRenderer.invoke('git:branches', cwd),
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:stage', cwd, files),
    stageAll: (cwd: string) => ipcRenderer.invoke('git:stageAll', cwd),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:unstage', cwd, files),
    unstageAll: (cwd: string) => ipcRenderer.invoke('git:unstageAll', cwd),
    commit: (cwd: string, message: string) => ipcRenderer.invoke('git:commit', cwd, message),
    push: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
    pull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
    fetch: (cwd: string) => ipcRenderer.invoke('git:fetch', cwd),
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke('git:checkout', cwd, branch),
    createBranch: (cwd: string, name: string) => ipcRenderer.invoke('git:createBranch', cwd, name),
    deleteBranch: (cwd: string, name: string) => ipcRenderer.invoke('git:deleteBranch', cwd, name),
    diff: (cwd: string, file: string, staged: boolean) => ipcRenderer.invoke('git:diff', cwd, file, staged),
    commitDiff: (cwd: string, hash: string) => ipcRenderer.invoke('git:commitDiff', cwd, hash),
    commitFiles: (cwd: string, hash: string) => ipcRenderer.invoke('git:commitFiles', cwd, hash),
    discard: (cwd: string, file: string) => ipcRenderer.invoke('git:discard', cwd, file),
    remotes: (cwd: string) => ipcRenderer.invoke('git:remotes', cwd),
  },

  // ─── System ──────────────────────────────────────────────────────
  system: {
    openExternal: (url: string) =>
      ipcRenderer.invoke('system:openExternal', url),
    getHomePath: () =>
      ipcRenderer.invoke('system:getHomePath'),
    showOpenDialog: (options: any) =>
      ipcRenderer.invoke('system:showOpenDialog', options),
    getTheme: () =>
      ipcRenderer.invoke('system:getTheme'),
    which: (cmd: string) =>
      ipcRenderer.invoke('system:which', cmd),
  },

  // ─── Events ──────────────────────────────────────────────────────
  on: (channel: string, callback: (...args: any[]) => void) => {
    const handler = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type StudioAPI = typeof api
