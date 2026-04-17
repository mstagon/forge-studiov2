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
