import { create } from 'zustand'
import type { Workspace, HarnessInfo, McpStatus, SidebarView } from '@/types'

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  harnessInfo: HarnessInfo | null
  mcpStatus: McpStatus[]
  sidebarView: SidebarView
  sidebarVisible: boolean
  dashboardVisible: boolean
  commandPaletteVisible: boolean
  newWorkspaceDialogVisible: boolean

  loadWorkspaces: () => Promise<void>
  setActiveWorkspace: (workspace: Workspace) => void
  createWorkspace: (name: string, dirPath: string) => Promise<Workspace>
  openWorkspace: (dirPath: string) => Promise<Workspace>
  removeWorkspace: (id: string) => void
  scanHarness: () => Promise<void>
  scanMcp: () => Promise<void>

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
    get().scanHarness()
    get().scanMcp()
  },

  createWorkspace: async (name: string, dirPath: string) => {
    const templatePath = await window.api.workspace.getTemplatePath()
    const claudeMdPath = await window.api.workspace.getClaudeMdPath()
    const workspace = await window.api.workspace.create({
      name,
      path: dirPath,
      templatePath,
      claudeMdPath,
    })
    await get().loadWorkspaces()
    set({ activeWorkspace: workspace, newWorkspaceDialogVisible: false })
    get().scanHarness()
    return workspace
  },

  openWorkspace: async (dirPath: string) => {
    const workspace = await window.api.workspace.open(dirPath)
    await get().loadWorkspaces()
    set({ activeWorkspace: workspace })
    get().scanHarness()
    get().scanMcp()
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

  setSidebarView: (view: SidebarView) => set({ sidebarView: view, sidebarVisible: true }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  toggleDashboard: () => set((s) => ({ dashboardVisible: !s.dashboardVisible })),
  toggleCommandPalette: () => set((s) => ({ commandPaletteVisible: !s.commandPaletteVisible })),
  setNewWorkspaceDialog: (visible: boolean) => set({ newWorkspaceDialogVisible: visible }),
}))
