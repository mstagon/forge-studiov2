import { create } from 'zustand'
import type { Workspace, HarnessInfo, McpStatus, SidebarView, SplitReposOptions } from '@/types'

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  harnessInfo: HarnessInfo | null
  mcpStatus: McpStatus[]
  bundledHarnessVersion: string | null
  installedHarnessVersion: string | null
  harnessUpdating: boolean
  sidebarView: SidebarView
  sidebarVisible: boolean
  dashboardVisible: boolean
  commandPaletteVisible: boolean
  newWorkspaceDialogVisible: boolean

  loadWorkspaces: () => Promise<void>
  setActiveWorkspace: (workspace: Workspace) => void
  createWorkspace: (
    name: string,
    dirPath: string,
    splitRepos?: SplitReposOptions,
    crGraph?: { autoBuild?: boolean }
  ) => Promise<Workspace>
  openWorkspace: (dirPath: string) => Promise<Workspace>
  removeWorkspace: (id: string) => void
  scanHarness: () => Promise<void>
  scanMcp: () => Promise<void>
  refreshHarnessVersion: () => Promise<void>
  updateHarness: () => Promise<{ backupPath: string; version: string } | null>

  setSidebarView: (view: SidebarView) => void
  toggleSidebar: () => void
  toggleDashboard: () => void
  toggleCommandPalette: () => void
  setNewWorkspaceDialog: (visible: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  harnessInfo: null,
  mcpStatus: [],
  bundledHarnessVersion: null,
  installedHarnessVersion: null,
  harnessUpdating: false,
  sidebarView: 'workspaces',
  sidebarVisible: true,
  dashboardVisible: false,
  commandPaletteVisible: false,
  newWorkspaceDialogVisible: false,

  loadWorkspaces: async () => {
    const workspaces = await window.api.workspace.list()
    set({ workspaces })
  },

  setActiveWorkspace: (workspace: Workspace) => {
    set({ activeWorkspace: workspace })
    // Repoint the team watcher at this workspace's .claude/teams dir so
    // workspace-scoped teams created via the wizard land in (and refresh
    // from) the right place.
    void window.api.teams.setWorkspace(workspace.path).catch((err) => {
      console.error('[workspace] teams.setWorkspace failed:', err)
    })
    get().scanHarness()
    get().scanMcp()
    get().refreshHarnessVersion()
  },

  createWorkspace: async (
    name: string,
    dirPath: string,
    splitRepos?: SplitReposOptions,
    crGraph?: { autoBuild?: boolean }
  ) => {
    const templatePath = await window.api.workspace.getTemplatePath()
    const claudeMdPath = await window.api.workspace.getClaudeMdPath()
    const workspace = await window.api.workspace.create({
      name,
      path: dirPath,
      templatePath,
      claudeMdPath,
      splitRepos: splitRepos?.enabled ? splitRepos : undefined,
      crGraph: crGraph?.autoBuild ? { autoBuild: true } : undefined,
    })
    await get().loadWorkspaces()
    set({ activeWorkspace: workspace, newWorkspaceDialogVisible: false })
    void window.api.teams.setWorkspace(workspace.path).catch(() => {})
    get().scanHarness()
    get().refreshHarnessVersion()
    return workspace
  },

  openWorkspace: async (dirPath: string) => {
    const workspace = await window.api.workspace.open(dirPath)
    await get().loadWorkspaces()
    set({ activeWorkspace: workspace })
    void window.api.teams.setWorkspace(workspace.path).catch(() => {})
    get().scanHarness()
    get().scanMcp()
    get().refreshHarnessVersion()
    return workspace
  },

  removeWorkspace: (id: string) => {
    window.api.workspace.remove(id)
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      activeWorkspace: state.activeWorkspace?.id === id ? null : state.activeWorkspace,
    }))
  },

  scanHarness: async () => {
    const ws = get().activeWorkspace
    if (!ws) return
    const info = await window.api.harness.scan(ws.path)
    set({ harnessInfo: info })
  },

  scanMcp: async () => {
    const ws = get().activeWorkspace
    if (!ws) return
    const status = await window.api.harness.getMcpStatus(ws.path)
    set({ mcpStatus: status })
  },

  refreshHarnessVersion: async () => {
    const ws = get().activeWorkspace
    if (!ws) {
      set({ installedHarnessVersion: null })
      return
    }
    try {
      const [bundled, installed] = await Promise.all([
        window.api.harness.getBundledVersion(),
        window.api.harness.getInstalledVersion(ws.path),
      ])
      set({ bundledHarnessVersion: bundled, installedHarnessVersion: installed })
    } catch (err) {
      console.error('Failed to read harness version:', err)
    }
  },

  updateHarness: async () => {
    const ws = get().activeWorkspace
    if (!ws) return null
    set({ harnessUpdating: true })
    try {
      const result = await window.api.harness.update(ws.path)
      await get().refreshHarnessVersion()
      await get().scanHarness()
      return result
    } finally {
      set({ harnessUpdating: false })
    }
  },

  setSidebarView: (view: SidebarView) => set({ sidebarView: view, sidebarVisible: true }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  toggleDashboard: () => set((s) => ({ dashboardVisible: !s.dashboardVisible })),
  toggleCommandPalette: () => set((s) => ({ commandPaletteVisible: !s.commandPaletteVisible })),
  setNewWorkspaceDialog: (visible: boolean) => set({ newWorkspaceDialogVisible: visible }),
}))
