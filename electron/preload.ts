import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const ALLOWED_CHANNELS = new Set([
  'navigate',
  'action',
  'workspace-opened',
  'error-log:push',
])

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
      crGraph?: { autoBuild?: boolean }
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

    // ─── Authoring (CRUD) ──────────────────────────────────────────
    createAgent: (
      workspacePath: string,
      opts: { name: string; description?: string; tools?: string; model?: string; body?: string }
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:createAgent', workspacePath, opts),
    updateAgent: (
      workspacePath: string,
      name: string,
      body: string
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:updateAgent', workspacePath, name, body),
    deleteAgent: (workspacePath: string, name: string): Promise<{ trash: string }> =>
      ipcRenderer.invoke('harness:deleteAgent', workspacePath, name),
    renameAgent: (
      workspacePath: string,
      oldName: string,
      newName: string
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:renameAgent', workspacePath, oldName, newName),

    createSkill: (
      workspacePath: string,
      opts: { name: string; description?: string; globs?: string; body?: string }
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:createSkill', workspacePath, opts),
    updateSkill: (
      workspacePath: string,
      name: string,
      body: string
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:updateSkill', workspacePath, name, body),
    deleteSkill: (workspacePath: string, name: string): Promise<{ trash: string }> =>
      ipcRenderer.invoke('harness:deleteSkill', workspacePath, name),
    renameSkill: (
      workspacePath: string,
      oldName: string,
      newName: string
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:renameSkill', workspacePath, oldName, newName),

    createCommand: (
      workspacePath: string,
      opts: { name: string; description?: string; argHint?: string; body?: string }
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:createCommand', workspacePath, opts),
    updateCommand: (
      workspacePath: string,
      name: string,
      body: string
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:updateCommand', workspacePath, name, body),
    deleteCommand: (workspacePath: string, name: string): Promise<{ trash: string }> =>
      ipcRenderer.invoke('harness:deleteCommand', workspacePath, name),
    renameCommand: (
      workspacePath: string,
      oldName: string,
      newName: string
    ): Promise<{ file: string }> =>
      ipcRenderer.invoke('harness:renameCommand', workspacePath, oldName, newName),

    addHook: (
      workspacePath: string,
      event: string,
      hook: {
        matcher?: string
        command: string
        type?: string
        timeout?: number
        disabled?: boolean
      }
    ): Promise<{ index: number }> =>
      ipcRenderer.invoke('harness:addHook', workspacePath, event, hook),
    removeHook: (workspacePath: string, event: string, index: number): Promise<void> =>
      ipcRenderer.invoke('harness:removeHook', workspacePath, event, index),
    updateHook: (
      workspacePath: string,
      event: string,
      index: number,
      hook: {
        matcher?: string
        command: string
        type?: string
        timeout?: number
        disabled?: boolean
      }
    ): Promise<void> =>
      ipcRenderer.invoke('harness:updateHook', workspacePath, event, index, hook),

    listMcpServers: (
      workspacePath: string
    ): Promise<
      Array<{
        name: string
        spec: {
          command?: string
          args?: string[]
          env?: Record<string, string>
          type?: 'stdio' | 'http' | 'sse'
          url?: string
          disabled?: boolean
        }
      }>
    > => ipcRenderer.invoke('harness:listMcpServers', workspacePath),
    addMcpServer: (
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
    ): Promise<void> =>
      ipcRenderer.invoke('harness:addMcpServer', workspacePath, name, spec),
    updateMcpServer: (
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
    ): Promise<void> =>
      ipcRenderer.invoke('harness:updateMcpServer', workspacePath, name, spec),
    removeMcpServer: (workspacePath: string, name: string): Promise<void> =>
      ipcRenderer.invoke('harness:removeMcpServer', workspacePath, name),
    testMcpConnection: (
      workspacePath: string,
      name: string
    ): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke('harness:testMcpConnection', workspacePath, name),

    getPermissions: (
      workspacePath: string
    ): Promise<{ allow: string[]; deny: string[] }> =>
      ipcRenderer.invoke('harness:getPermissions', workspacePath),
    setPermissions: (
      workspacePath: string,
      next: { allow: string[]; deny: string[] }
    ): Promise<void> =>
      ipcRenderer.invoke('harness:setPermissions', workspacePath, next),

    syncRouting: (
      workspacePath: string,
      kind: 'agent' | 'skill',
      entry: { name: string; description?: string; pattern?: string }
    ): Promise<{ updated: boolean; file: string }> =>
      ipcRenderer.invoke('harness:syncRouting', workspacePath, kind, entry),
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
      autoStartClaude?: boolean
    }): Promise<{
      teamId: string
      configPath: string
      worktreesCreated: number
      tmuxSessionsStarted: number
    }> => ipcRenderer.invoke('teams:create', opts),
    remove: (teamId: string): Promise<void> =>
      ipcRenderer.invoke('teams:remove', teamId),
    pause: (teamId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('teams:pause', teamId),
    resume: (teamId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('teams:resume', teamId),
    pauseMember: (teamId: string, agentId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('teams:pauseMember', teamId, agentId),
    resumeMember: (teamId: string, agentId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('teams:resumeMember', teamId, agentId),
    merge: (
      teamId: string,
      opts?: { mergeStrategy?: 'squash' | 'sequential' }
    ): Promise<{
      ok: boolean
      mergedBranch?: string
      commitSha?: string
      conflicts?: { file: string; theirsBranch: string; oursBranch: string; conflictMarkers: string }[]
      error?: string
    }> => ipcRenderer.invoke('teams:merge', teamId, opts),
  },

  // ─── code-review-graph ───────────────────────────────────────────
  crGraph: {
    isInstalled: (): Promise<{
      installed: boolean
      version?: string
      method?: 'pipx' | 'pip' | 'uv'
    }> => ipcRenderer.invoke('cr-graph:isInstalled'),
    install: (
      method?: 'pipx' | 'pip' | 'uv'
    ): Promise<{ ok: boolean; output: string }> =>
      ipcRenderer.invoke('cr-graph:install', method),
    build: (
      workspacePath: string
    ): Promise<{ ok: boolean; durationMs: number; output: string }> =>
      ipcRenderer.invoke('cr-graph:build', workspacePath),
    stats: (
      workspacePath: string
    ): Promise<{
      nodes: number
      edges: number
      files: number
      languages: string[]
      lastBuiltAt: string | null
    } | null> => ipcRenderer.invoke('cr-graph:stats', workspacePath),
    vizStart: (workspacePath: string): Promise<{ url: string; pid: number }> =>
      ipcRenderer.invoke('cr-graph:vizStart', workspacePath),
    vizStop: (pid: number): Promise<boolean> =>
      ipcRenderer.invoke('cr-graph:vizStop', pid),
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

  // ─── Hook Profiler ───────────────────────────────────────────────
  hookProfiler: {
    recent: (
      limit?: number
    ): Promise<
      Array<{
        ts: string
        event: string
        script: string
        durationMs: number
        exitCode: number
        output?: string
      }>
    > => ipcRenderer.invoke('hook-profiler:recent', limit),
    stats: (
      window?: number
    ): Promise<
      Array<{
        script: string
        event: string
        calls: number
        successCount: number
        failureCount: number
        avgMs: number
        p95Ms: number
        successRate: number
        lastRunTs: string | null
        lastFailure: {
          ts: string
          event: string
          script: string
          durationMs: number
          exitCode: number
          output?: string
        } | null
      }>
    > => ipcRenderer.invoke('hook-profiler:stats', window),
    record: (payload: {
      event: string
      script: string
      durationMs: number
      exitCode: number
      output?: string
    }): Promise<void> => ipcRenderer.invoke('hook-profiler:record', payload),
  },

  // ─── Error Log (one-way push from main → renderer) ──────────────
  errorLog: {
    /** Subscribe to errors pushed from the main process. */
    onPush: (
      callback: (payload: {
        ts: string
        code: string
        category: string
        message: string
        context?: Record<string, unknown>
      }) => void,
    ) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: {
          ts: string
          code: string
          category: string
          message: string
          context?: Record<string, unknown>
        },
      ) => callback(payload)
      ipcRenderer.on('error-log:push', handler)
      return () => ipcRenderer.removeListener('error-log:push', handler)
    },
    /** Renderer-side errors that should also surface to other windows. */
    report: (payload: {
      code: string
      category: string
      message: string
      context?: Record<string, unknown>
    }) => ipcRenderer.send('error-log:report', payload),
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
