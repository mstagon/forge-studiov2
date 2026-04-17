export interface TerminalTab {
  id: string
  title: string
  ptyId: string | null
  cwd: string
  panes: TerminalPane[]
  activePaneId: string
}

export interface TerminalPane {
  id: string
  ptyId: string | null
  direction?: 'horizontal' | 'vertical'
  children?: TerminalPane[]
  size?: number // percentage
}

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: string
  lastOpened: string
  harnessApplied: boolean
}

export interface HarnessInfo {
  agents: { name: string; file: string }[]
  skills: { name: string; file: string }[]
  commands: { name: string; file: string }[]
  scripts: { name: string; file: string }[]
  rules: { name: string; file: string }[]
  mcpServers: { name: string; enabled: boolean; type: string }[]
  hooks: Record<string, number>
}

export interface McpStatus {
  name: string
  status: string
  command?: string
}

export type SidebarView = 'workspaces' | 'dashboard' | 'settings'
export type Theme = 'dark' | 'light'

declare global {
  interface Window {
    api: import('../../electron/preload').StudioAPI
  }
}
