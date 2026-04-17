import { useEffect, useCallback } from 'react'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/layout/Sidebar'
import { StatusBar } from './components/layout/StatusBar'
import { TerminalPanel } from './components/terminal/TerminalPanel'
import { DashboardPanel } from './components/dashboard/DashboardPanel'
import { CommandPalette } from './components/dashboard/CommandPalette'
import { NewWorkspaceDialog } from './components/workspace/NewWorkspaceDialog'
import { HarnessUpdateBanner } from './components/workspace/HarnessUpdateBanner'
import { GitGraphPanel } from './components/git/GitGraphPanel'
import { useWorkspaceStore } from './stores/workspace'
import { useTerminalStore } from './stores/terminal'

export default function App() {
  const {
    sidebarVisible, loadWorkspaces, activeWorkspace,
    toggleSidebar, toggleDashboard, toggleCommandPalette,
    setNewWorkspaceDialog, openWorkspace,
  } = useWorkspaceStore()

  const { addTab, nextTab, prevTab, toggleSearch, tabs } = useTerminalStore()

  // Initialize
  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  // Create initial terminal when workspace is set
  useEffect(() => {
    if (activeWorkspace && tabs.length === 0) {
      addTab(activeWorkspace.path)
    }
  }, [activeWorkspace, tabs.length, addTab])

  // Listen for main process events
  useEffect(() => {
    const cleanups = [
      window.api.on('action', (action: string) => {
        switch (action) {
          case 'new-tab': addTab(activeWorkspace?.path); break
          case 'new-workspace': setNewWorkspaceDialog(true); break
          case 'toggle-sidebar': toggleSidebar(); break
          case 'toggle-dashboard': toggleDashboard(); break
          case 'command-palette': toggleCommandPalette(); break
          case 'terminal-search': toggleSearch(); break
          case 'next-tab': nextTab(); break
          case 'prev-tab': prevTab(); break
          case 'split-horizontal': {
            const store = useTerminalStore.getState()
            const tab = store.tabs.find((t) => t.id === store.activeTabId)
            if (tab) store.splitPane(tab.id, tab.activePaneId, 'horizontal')
            break
          }
          case 'split-vertical': {
            const store = useTerminalStore.getState()
            const tab = store.tabs.find((t) => t.id === store.activeTabId)
            if (tab) store.splitPane(tab.id, tab.activePaneId, 'vertical')
            break
          }
          case 'close-pane': {
            const store = useTerminalStore.getState()
            const tab = store.tabs.find((t) => t.id === store.activeTabId)
            if (tab) {
              if (tab.panes.length > 1) {
                store.removePane(tab.id, tab.activePaneId)
              } else {
                store.removeTab(tab.id)
              }
            }
            break
          }
          case 'clear-terminal': {
            // Send clear to active terminal
            const store = useTerminalStore.getState()
            const tab = store.tabs.find((t) => t.id === store.activeTabId)
            if (tab) {
              const pane = tab.panes.find((p) => p.id === tab.activePaneId)
              if (pane?.ptyId) window.api.pty.write(pane.ptyId, 'clear\n')
            }
            break
          }
        }
      }),
      window.api.on('workspace-opened', (dirPath: string) => {
        openWorkspace(dirPath)
      }),
      window.api.on('navigate', (target: string) => {
        if (target === 'settings') {
          useWorkspaceStore.getState().setSidebarView('settings')
        }
      }),
    ]

    return () => cleanups.forEach((c) => c())
  }, [activeWorkspace, addTab, toggleSidebar, toggleDashboard, toggleCommandPalette, setNewWorkspaceDialog, openWorkspace, nextTab, prevTab, toggleSearch])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey

    if (meta && e.shiftKey && e.key === 'p') {
      e.preventDefault()
      toggleCommandPalette()
    }
  }, [toggleCommandPalette])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col h-screen">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {sidebarVisible && <Sidebar />}
        <div className="flex-1 flex flex-col overflow-hidden">
          <HarnessUpdateBanner />
          <div className="flex-1 overflow-hidden">
            <TerminalPanel />
          </div>
        </div>
        <DashboardPanel />
        <GitGraphPanel />
      </div>
      <StatusBar />

      {/* Overlays */}
      <CommandPalette />
      <NewWorkspaceDialog />
    </div>
  )
}
