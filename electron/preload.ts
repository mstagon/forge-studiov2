import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const ALLOWED_CHANNELS = new Set([
  'navigate',
  'action',
  'workspace-opened',
  'error-log:push',
  'team-activity:event',
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
      preset?: string
      mcpChoices?: string[]
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

    /** Sanity-check the workspace harness: missing files, broken refs, etc. */
    lint: (
      workspacePath: string,
    ): Promise<{
      errors: { file: string; line?: number; severity: 'error' | 'warning' | 'info'; message: string; fix?: string }[]
      warnings: { file: string; line?: number; severity: 'error' | 'warning' | 'info'; message: string; fix?: string }[]
      info: { file: string; line?: number; severity: 'error' | 'warning' | 'info'; message: string; fix?: string }[]
      checkedAt: string
    }> => ipcRenderer.invoke('harness:lint', workspacePath),

    /** Diff bundled template vs workspace `.claude/` for the update preview UI. */
    previewUpdate: (
      workspacePath: string,
    ): Promise<{
      added: { rel: string; size?: number }[]
      removed: { rel: string; size?: number }[]
      modified: { rel: string; binary: boolean; diff: string }[]
      unchanged: number
    }> => ipcRenderer.invoke('harness:previewUpdate', workspacePath),

    /** Compose what Claude sees on session start (CLAUDE.md + @-loaded rules + hook list). */
    previewSessionContext: (
      workspacePath: string,
    ): Promise<{
      sections: {
        kind: 'claude-md' | 'rule' | 'hook'
        label: string
        file: string
        content: string
        missing?: boolean
      }[]
      totalChars: number
      tokenEstimate: number
    }> => ipcRenderer.invoke('harness:previewSessionContext', workspacePath),
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

  // ─── Presets ─────────────────────────────────────────────────────
  preset: {
    list: (): Promise<
      {
        id: string
        name: string
        description?: string
        source: 'bundled' | 'user'
        templatePath: string
        claudeMdPath?: string
      }[]
    > => ipcRenderer.invoke('preset:list'),
    apply: (
      workspacePath: string,
      presetId: string,
    ): Promise<{
      ok: true
      preset: {
        id: string
        name: string
        description?: string
        source: 'bundled' | 'user'
        templatePath: string
        claudeMdPath?: string
      }
    }> => ipcRenderer.invoke('preset:apply', workspacePath, presetId),
    save: (
      workspacePath: string,
      options: { id: string; name?: string; description?: string },
    ): Promise<{
      id: string
      name: string
      description?: string
      source: 'bundled' | 'user'
      templatePath: string
      claudeMdPath?: string
    }> => ipcRenderer.invoke('preset:save', workspacePath, options),
    delete: (presetId: string): Promise<void> =>
      ipcRenderer.invoke('preset:delete', presetId),
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
    // `degraded: true` means we couldn't actually SIGSTOP/SIGCONT the agent's
    // process tree (no valid pane id, kill failed, etc.) — the UI flagged
    // paused/resumed but the underlying claude process is still running.
    // Renderer should surface a warning toast in that case.
    pause: (teamId: string): Promise<{ ok: boolean; degraded?: boolean }> =>
      ipcRenderer.invoke('teams:pause', teamId),
    resume: (teamId: string): Promise<{ ok: boolean; degraded?: boolean }> =>
      ipcRenderer.invoke('teams:resume', teamId),
    pauseMember: (teamId: string, agentId: string): Promise<{ ok: boolean; degraded?: boolean }> =>
      ipcRenderer.invoke('teams:pauseMember', teamId, agentId),
    resumeMember: (teamId: string, agentId: string): Promise<{ ok: boolean; degraded?: boolean }> =>
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
    /** Member ↔ member 메시지: 상대 멤버의 inbox 에 entry append. */
    sendMessage: (opts: { teamId: string; fromAgent: string; toAgent: string; text: string; summary?: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('teams:sendMessage', opts),
    /** 멤버의 inbox 읽기 (newest first). */
    readInbox: (opts: { teamId: string; agentName: string }): Promise<Array<{ from: string; text: string; summary?: string; timestamp: string; read?: boolean }>> =>
      ipcRenderer.invoke('teams:readInbox', opts),
    /** 멤버의 inbox 모든 메시지 read 플래그 갱신. */
    markInboxRead: (opts: { teamId: string; agentName: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('teams:markInboxRead', opts),
    /** 같은 파일 수정 중인 멤버 감지 — 머지 충돌 사전 경고. */
    detectConflicts: (opts: { teamId: string }): Promise<Array<{ file: string; members: string[] }>> =>
      ipcRenderer.invoke('teams:detectConflicts', opts),
  },

  // ─── Team Activity ───────────────────────────────────────────────
  //
  // RunLiveView's right-rail activity feed reads the JSONL tail via list()
  // and subscribes to live pushes via onEvent(). The single-channel layout
  // (one event stream for all teams) was chosen over per-team channels so
  // the preload allowlist stays small.
  teamActivity: {
    list: (
      teamId: string,
      limit?: number,
    ): Promise<
      Array<{
        ts: number
        teamId: string
        agent: string
        kind: 'edit' | 'commit' | 'state-change'
        file?: string
        added?: number
        removed?: number
        message?: string
        files?: string[]
        sha?: string
        from?: string
        to?: string
        text?: string
      }>
    > => ipcRenderer.invoke('team-activity:list', teamId, limit),
    onEvent: (
      callback: (event: {
        ts: number
        teamId: string
        agent: string
        kind: 'edit' | 'commit' | 'state-change'
        file?: string
        added?: number
        removed?: number
        message?: string
        files?: string[]
        sha?: string
        from?: string
        to?: string
        text?: string
      }) => void,
    ) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: {
          ts: number
          teamId: string
          agent: string
          kind: 'edit' | 'commit' | 'state-change'
          file?: string
          added?: number
          removed?: number
          message?: string
          files?: string[]
          sha?: string
          from?: string
          to?: string
          text?: string
        },
      ) => callback(payload)
      ipcRenderer.on('team-activity:event', handler)
      return () => ipcRenderer.removeListener('team-activity:event', handler)
    },
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

  // ─── Settings (Integrations / .env tokens) ───────────────────────
  //
  // Integrations 토큰을 워크스페이스의 .env 파일에 저장. .gitignore 자동
  // 등록. 멤버 spawn 시 child env 로 propagate. 값 자체는 Forge 가
  // 안 보고 .env 에 plain text — keychain 저장은 v0.9.1+.
  settings: {
    saveEnvVar: (opts: { workspacePath: string; key: string; value: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:saveEnvVar', opts),
    readEnvKeys: (opts: { workspacePath: string }): Promise<string[]> =>
      ipcRenderer.invoke('settings:readEnvKeys', opts),
    removeEnvVar: (opts: { workspacePath: string; key: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:removeEnvVar', opts),
  },

  // ─── ForgeConfig (팀 동작 설정 — ~/.forge-studio/config.json) ─────
  forgeConfig: {
    get: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('forgeConfig:get'),
    set: (partial: Record<string, unknown>): Promise<{ ok: boolean; config?: Record<string, unknown>; error?: string }> =>
      ipcRenderer.invoke('forgeConfig:set', partial),
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
    /**
     * Absolute path of the bundled-tools root (Contents/Resources/bundled-tools
     * in a packaged app, resources/bundled-tools/darwin-arm64 in dev), or
     * `null` when the bundle isn't present. Onboarding uses this to decide
     * whether a `which` hit lives inside the DMG (→ "Bundled" pill).
     */
    bundledToolsRoot: () =>
      ipcRenderer.invoke('system:bundledToolsRoot') as Promise<string | null>,
    /**
     * One-shot snapshot of CPU / memory / disk-delta / pty-count for the
     * WorkspaceV2 ResourceBar. The main process caches for ~5s so this is
     * cheap to call on a 5s polling interval. Always resolves — failure
     * cases return zeros rather than rejecting.
     */
    resourceSnapshot: (): Promise<{
      cpu: number
      memUsed: number
      memTotal: number
      diskDeltaGb: number
      ptyCount: number
      ts: number
    }> => ipcRenderer.invoke('resource:snapshot'),
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
