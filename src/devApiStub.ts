// Dev-only stub for window.api so the app can boot in a plain browser
// (Vite dev server, Playwright/chromium MCP) without an Electron preload.
//
// In production (packaged Electron) the real preload runs first and populates
// window.api with IPC-backed implementations — this stub never installs.
//
// Stubs are intentionally noisy:
//   - Promise-returning methods resolve to neutral empty values (`null`, `[]`,
//     `''`, etc.) so callers that ignore errors render their empty/loading state.
//   - Subscriptions return a no-op unsubscribe so cleanup is safe.
//   - Anything we forgot is logged once via the proxy fallback so the next
//     run of the dev test points to it.
//
// This is a pure side-effect import; main.tsx wires it conditionally.

type AnyFn = (...args: unknown[]) => unknown

const noopUnsub = () => () => {}
const resolveNull = () => Promise.resolve(null)
const resolveEmptyArr = () => Promise.resolve([])
const resolveEmptyStr = () => Promise.resolve('')
const resolveOk = () => Promise.resolve({ ok: true })

/**
 * Wrap a namespace object with a Proxy that returns a logging no-op for any
 * accessed method we didn't explicitly stub. Keeps the surface small while
 * preventing `Cannot read properties of undefined (reading 'foo')` crashes.
 */
function loggingProxy<T extends Record<string, unknown>>(name: string, base: T): T {
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return (target as Record<string, unknown>)[prop]
      const path = `${name}.${String(prop)}`
      // Return a noop function. Logging is one-shot per access path so the
      // console doesn't get flooded under a tight render loop.
      let warned = false
      return (..._args: unknown[]) => {
        if (!warned) {
          // eslint-disable-next-line no-console
          console.warn(`[devApiStub] ${path}() called — returning noop`)
          warned = true
        }
        return Promise.resolve(null)
      }
    },
  }) as T
}

export function installDevApiStub(): void {
  if (typeof window === 'undefined') return
  if ((window as { api?: unknown }).api) return // real preload already loaded

  const stub = {
    pty: loggingProxy('pty', {
      create: (() => Promise.resolve('dev-pty-0')) as AnyFn,
      write: (() => {}) as AnyFn,
      resize: (() => {}) as AnyFn,
      dispose: (() => {}) as AnyFn,
      getCwd: resolveEmptyStr as AnyFn,
      onData: noopUnsub as AnyFn,
      onExit: noopUnsub as AnyFn,
    }),
    workspace: loggingProxy('workspace', {
      // Provide one fake workspace so the main UI renders. Real Electron
      // pushes the persisted workspace list here; in dev we just need
      // *something* to satisfy the boot path.
      list: (() =>
        Promise.resolve([
          {
            id: 'dev-ws',
            name: 'Dev Workspace',
            path: '/tmp/forge-dev-workspace',
            createdAt: Date.now(),
            lastOpened: Date.now(),
            harnessApplied: true,
          },
        ])) as AnyFn,
      open: (() =>
        Promise.resolve({
          id: 'dev-ws',
          name: 'Dev Workspace',
          path: '/tmp/forge-dev-workspace',
          createdAt: Date.now(),
          lastOpened: Date.now(),
          harnessApplied: true,
        })) as AnyFn,
      create: (() =>
        Promise.resolve({
          id: 'dev-ws',
          name: 'Dev Workspace',
          path: '/tmp/forge-dev-workspace',
          createdAt: Date.now(),
          lastOpened: Date.now(),
          harnessApplied: true,
        })) as AnyFn,
      remove: (() => Promise.resolve()) as AnyFn,
      getTemplatePath: resolveEmptyStr as AnyFn,
      getClaudeMdPath: resolveEmptyStr as AnyFn,
      setActive: (() => Promise.resolve()) as AnyFn,
    }),
    harness: loggingProxy('harness', {
      scan: (() =>
        Promise.resolve({
          scripts: [],
          rules: [],
          skills: [],
          agents: [],
          commands: [],
          hooks: {},
        })) as AnyFn,
      readFile: resolveEmptyStr as AnyFn,
      getMcpStatus: resolveEmptyArr as AnyFn,
      getBundledVersion: resolveEmptyStr as AnyFn,
      getInstalledVersion: resolveNull as AnyFn,
      update: resolveOk as AnyFn,
      lint: (() =>
        Promise.resolve({ errors: [], warnings: [], info: [], checkedAt: new Date().toISOString() })) as AnyFn,
      previewUpdate: (() =>
        Promise.resolve({ added: [], removed: [], modified: [], unchanged: 0 })) as AnyFn,
      previewSessionContext: (() =>
        Promise.resolve({ sections: [], totalChars: 0, tokenEstimate: 0 })) as AnyFn,
      listAgents: resolveEmptyArr as AnyFn,
      listSkills: resolveEmptyArr as AnyFn,
      listCommands: resolveEmptyArr as AnyFn,
      listHooks: resolveEmptyArr as AnyFn,
      listCompositions: resolveEmptyArr as AnyFn,
    }),
    teams: loggingProxy('teams', {
      list: resolveEmptyArr as AnyFn,
      create: (() =>
        Promise.resolve({ teamId: 'dev-team-0', configPath: '', worktreesCreated: 0, tmuxSessionsStarted: 0 })) as AnyFn,
      remove: (() => Promise.resolve()) as AnyFn,
      pause: resolveOk as AnyFn,
      resume: resolveOk as AnyFn,
      pauseMember: resolveOk as AnyFn,
      resumeMember: resolveOk as AnyFn,
      merge: (() => Promise.resolve({ ok: true, mergedBranch: 'main' })) as AnyFn,
      openAgentTerminal: (() => Promise.resolve('dev-pty-1')) as AnyFn,
      subscribe: noopUnsub as AnyFn,
      onUpdate: noopUnsub as AnyFn,
      sendMessage: resolveOk as AnyFn,
      readInbox: resolveEmptyArr as AnyFn,
      markInboxRead: resolveOk as AnyFn,
    }),
    git: loggingProxy('git', {
      status: (() =>
        Promise.resolve({
          branch: 'main',
          clean: true,
          staged: [],
          unstaged: [],
          untracked: [],
          ahead: 0,
          behind: 0,
        })) as AnyFn,
      branches: resolveEmptyArr as AnyFn,
      log: resolveEmptyArr as AnyFn,
      diff: resolveEmptyStr as AnyFn,
    }),
    files: loggingProxy('files', {
      list: resolveEmptyArr as AnyFn,
      read: resolveEmptyStr as AnyFn,
      write: (() => Promise.resolve()) as AnyFn,
    }),
    // Mirrors preload.ts `fs` namespace. Stores like useFilesStore call
    // `window.api.fs.listDir(...)` directly; without this stub, browser-mode
    // (Vite without Electron) crashes the renderer with "Cannot read
    // properties of undefined (reading 'listDir')".
    fs: loggingProxy('fs', {
      listDir: (() => Promise.resolve({ entries: [] })) as AnyFn,
      readFile: (() =>
        Promise.resolve({ content: null, truncated: false, binary: false, size: 0 })) as AnyFn,
    }),
    system: loggingProxy('system', {
      openExternal: (() => Promise.resolve()) as AnyFn,
      showItemInFolder: (() => Promise.resolve()) as AnyFn,
    }),
    settings: loggingProxy('settings', {
      saveEnvVar: resolveOk as AnyFn,
      readEnvKeys: resolveEmptyArr as AnyFn,
      removeEnvVar: resolveOk as AnyFn,
    }),
    crGraph: loggingProxy('crGraph', {
      build: resolveOk as AnyFn,
      query: resolveEmptyArr as AnyFn,
      isAvailable: (() => Promise.resolve(false)) as AnyFn,
    }),
    teamActivity: loggingProxy('teamActivity', {
      list: resolveEmptyArr as AnyFn,
      onEvent: noopUnsub as AnyFn,
    }),
    resource: loggingProxy('resource', {
      snapshot: (() => Promise.resolve({ cpu: 0, mem: 0, disk: 0, ptyCount: 0 })) as AnyFn,
    }),
    onMainError: noopUnsub as AnyFn,
    // Generic main-process event channel. App.tsx subscribes to 'action',
    // 'workspace-opened', 'navigate' here. Stub returns a no-op unsubscribe.
    on: ((_event: string, _cb: AnyFn) => () => {}) as AnyFn,
    off: ((_event: string, _cb: AnyFn) => {}) as AnyFn,
  }

  ;(window as unknown as { api: typeof stub }).api = stub
  // eslint-disable-next-line no-console
  console.info('[devApiStub] installed — all window.api.* return neutral values')
}
