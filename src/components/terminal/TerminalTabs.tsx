import { useTerminalStore } from '@/stores/terminal'
import { VscClose, VscAdd, VscSplitHorizontal, VscSplitVertical, VscTerminal } from 'react-icons/vsc'

export function TerminalTabs() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab } = useTerminalStore()

  return (
    <div className="flex items-center bg-surface-1 border-b border-border h-9 select-none">
      <div className="flex items-center flex-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group flex items-center gap-1.5 px-3 h-full cursor-pointer border-r border-border text-xs transition-colors ${
              tab.id === activeTabId
                ? 'bg-surface-0 text-text-primary'
                : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
            }`}
            onClick={() => setActiveTab(tab.id)}
            onMouseDown={(e) => {
              // Middle click to close
              if (e.button === 1) {
                e.preventDefault()
                removeTab(tab.id)
              }
            }}
          >
            <VscTerminal className="text-accent shrink-0" size={13} />
            <span className="truncate max-w-32">{tab.title || 'Terminal'}</span>
            <button
              className="opacity-0 group-hover:opacity-100 hover:bg-surface-3 rounded p-0.5 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                removeTab(tab.id)
              }}
            >
              <VscClose size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center px-1 gap-0.5 shrink-0">
        <button
          className="p-1 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary transition-colors"
          onClick={() => addTab()}
          title="New Tab (Cmd+T)"
        >
          <VscAdd size={14} />
        </button>
        <button
          className="p-1 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary transition-colors"
          onClick={() => {
            const tab = tabs.find((t) => t.id === activeTabId)
            if (tab) {
              const store = useTerminalStore.getState()
              store.splitPane(tab.id, tab.activePaneId, 'horizontal')
            }
          }}
          title="Split Right (Cmd+Shift+H)"
        >
          <VscSplitHorizontal size={14} />
        </button>
        <button
          className="p-1 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary transition-colors"
          onClick={() => {
            const tab = tabs.find((t) => t.id === activeTabId)
            if (tab) {
              const store = useTerminalStore.getState()
              store.splitPane(tab.id, tab.activePaneId, 'vertical')
            }
          }}
          title="Split Down (Cmd+Shift+V)"
        >
          <VscSplitVertical size={14} />
        </button>
      </div>
    </div>
  )
}
