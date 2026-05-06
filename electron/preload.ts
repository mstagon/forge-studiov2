import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const ALLOWED_CHANNELS = new Set(['navigate', 'action', 'workspace-opened'])

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
      const handler = (_event: IpcRendererEvent, data: string) => callback(data)
      ipcRenderer.on(`pty:data:${id}`, handler)
      return () => ipcRenderer.removeListener(`pty:data:${id}`, handler)
    },
    onExit: (id: string, callback: (exitCode: number) => void) => {
      const handler = (_event: IpcRendererEvent, exitCode: number) => callback(exitCode)
      ipcRenderer.on(`pty:exit:${id}`, handler)
      return () => ipcRenderer.removeListener(`pty:exit:${id}`, handler)
    },
  },

  // ─── Workspace ───────────────────────────────────────────────────
  workspace: {
    create: (options: {
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
    }) => ipcRenderer.invoke('workspace:create', options),
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
    getBundledVersion: (): Promise<string> =>
      ipcRenderer.invoke('harness:getBundledVersion'),
    getInstalledVersion: (workspacePath: string): Promise<string | null> =>
      ipcRenderer.invoke('harness:getInstalledVersion', workspacePath),
    update: (workspacePath: string): Promise<{ backupPath: string; version: string }> =>
      ipcRenderer.invoke('harness:update', workspacePath),
    listAgents: (workspacePath: string) =>
      ipcRenderer.invoke('harness:listAgents', workspacePath),
    listSkills: (workspacePath: string) =>
      ipcRenderer.invoke('harness:listSkills', workspacePath),
    listCommands: (workspacePath: string) =>
      ipcRenderer.invoke('harness:listCommands', workspacePath),
    listHooks: (workspacePath: string) =>
      ipcRenderer.invoke('harness:listHooks', workspacePath),
    listCompositions: () =>
      ipcRenderer.invoke('harness:listCompositions'),
  },

  // ─── Filesystem ──────────────────────────────────────────────────
  fs: {
    listDir: (
      absPath: string,
      opts?: { includeHidden?: boolean; ignoreNodeModules?: boolean; includeHarness?: boolean }
    ): Promise<{ entries: { name: string; type: 'file' | 'dir'; size?: number }[] }> =>
      ipcRenderer.invoke('fs:listDir', absPath, opts ?? {}),
    readFile: (
      absPath: string,
      maxBytes?: number
    ): Promise<{ content: string | null; truncated: boolean; binary: boolean; size: number }> =>
      ipcRenderer.invoke('fs:readFile', absPath, maxBytes),
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

  // ─── Agent Teams ─────────────────────────────────────────────────
  teams: {
    list: () => ipcRenderer.invoke('teams:list'),
    onUpdate: (callback: (teams: unknown[]) => void) => {
      const handler = (_event: IpcRendererEvent, teams: unknown[]) => callback(teams)
      ipcRenderer.on('teams:update', handler)
      return () => ipcRenderer.removeListener('teams:update', handler)
    },
    openAgentTerminal: (options: { teamId: string; agentName: string; cols: number; rows: number }): Promise<string> =>
      ipcRenderer.invoke('teams:openAgentTerminal', options),
    /** Repoint the watcher at <workspacePath>/.claude/teams (or ~/.claude/teams when null). */
    setWorkspace: (workspacePath: string | null): Promise<void> =>
      ipcRenderer.invoke('teams:setWorkspace', workspacePath),
    create: (opts: {
      workspaceId: string
      workspacePath: string
      name: string
      goal?: string
      members: { agentId: string; task?: string }[]
      worktreeStrategy: 'isolated' | 'shared'
      mergeStrategy: 'squash' | 'sequential'
    }): Promise<{ teamId: string; configPath: string }> =>
      ipcRenderer.invoke('teams:create', opts),
    remove: (teamId: string): Promise<void> =>
      ipcRenderer.invoke('teams:remove', teamId),
  },

  // ─── Updates ─────────────────────────────────────────────────────
  updates: {
    check: (): Promise<{
      current: string
      latest: string | null
      hasUpdate: boolean
      releaseUrl: string | null
      publishedAt: string | null
      notes: string | null
      checkedAt: string
      error: string | null
    }> => ipcRenderer.invoke('updates:check'),
  },

  // ─── System ──────────────────────────────────────────────────────
  system: {
    openExternal: (url: string) =>
      ipcRenderer.invoke('system:openExternal', url),
    getHomePath: () =>
      ipcRenderer.invoke('system:getHomePath'),
    showOpenDialog: (options: Electron.OpenDialogOptions) =>
      ipcRenderer.invoke('system:showOpenDialog', options),
    getTheme: () =>
      ipcRenderer.invoke('system:getTheme'),
    which: (cmd: string) =>
      ipcRenderer.invoke('system:which', cmd),
  },

  // ─── Events ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (channel: string, callback: (...args: any[]) => void) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error(`IPC channel "${channel}" is not allowed`)
    }
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type StudioAPI = typeof api
