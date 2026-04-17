import { useWorkspaceStore } from '@/stores/workspace'
import { useTerminalStore } from '@/stores/terminal'
import { useGitStore } from '@/stores/git'
import { VscGitMerge } from 'react-icons/vsc'

export function StatusBar() {
  const { activeWorkspace, harnessInfo, mcpStatus, setSidebarView } = useWorkspaceStore()
  const { tabs } = useTerminalStore()
  const { status } = useGitStore()

  const healthyMcp = mcpStatus.filter((m) => m.status === 'available' || m.status === 'http').length
  const totalMcp = mcpStatus.length
  const totalChanges = status ? status.staged.length + status.unstaged.length + status.untracked.length : 0

  return (
    <div className="flex items-center h-6 bg-surface-1 border-t border-border px-3 text-2xs text-text-muted select-none gap-4">
      {activeWorkspace && (
        <>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-status-success" />
            {activeWorkspace.name}
          </span>
          {status?.isRepo && (
            <button
              className="flex items-center gap-1 hover:text-text-primary transition-colors"
              onClick={() => setSidebarView('git')}
            >
              <VscGitMerge size={12} />
              <span>{status.branch}</span>
              {status.ahead > 0 && <span>↑{status.ahead}</span>}
              {status.behind > 0 && <span>↓{status.behind}</span>}
              {totalChanges > 0 && <span className="text-status-warning">+{totalChanges}</span>}
            </button>
          )}
          {harnessInfo && (
            <>
              <span>{harnessInfo.agents.length} agents</span>
              <span>
                MCP {healthyMcp}/{totalMcp}
              </span>
            </>
          )}
        </>
      )}
      <div className="flex-1" />
      <span>{tabs.length} tab{tabs.length !== 1 ? 's' : ''}</span>
    </div>
  )
}
