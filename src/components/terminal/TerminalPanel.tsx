import { useTerminalStore } from '@/stores/terminal'
import { useWorkspaceStore } from '@/stores/workspace'
import { TerminalTabs } from './TerminalTabs'
import { XTerminal } from './XTerminal'

export function TerminalPanel() {
  const { tabs, activeTabId, searchVisible } = useTerminalStore()
  const { activeWorkspace } = useWorkspaceStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="flex flex-col h-full bg-surface-0">
      <TerminalTabs />
      <div className="flex-1 relative">
        {activeTab ? (
          <div className="absolute inset-0 flex">
            {activeTab.panes.map((pane, idx) => (
              <div
                key={pane.id}
                className={`flex-1 ${idx > 0 ? 'border-l border-border' : ''} ${
                  pane.id === activeTab.activePaneId ? '' : 'opacity-80'
                }`}
                onClick={() => {
                  useTerminalStore.getState().setActivePane(activeTab.id, pane.id)
                }}
              >
                <XTerminal
                  tabId={activeTab.id}
                  paneId={pane.id}
                  cwd={activeWorkspace?.path || ''}
                  isActive={pane.id === activeTab.activePaneId && activeTab.id === activeTabId}
                  searchVisible={searchVisible && pane.id === activeTab.activePaneId}
                  onTitleChange={(title) => {
                    useTerminalStore.getState().updateTabTitle(activeTab.id, title)
                  }}
                  onPtyCreated={(ptyId) => {
                    useTerminalStore.getState().setTabPtyId(activeTab.id, pane.id, ptyId)
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            No terminal open. Press Cmd+T to create one.
          </div>
        )}
      </div>
    </div>
  )
}
