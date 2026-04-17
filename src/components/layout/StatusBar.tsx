import { useWorkspaceStore } from '@/stores/workspace'
import { useTerminalStore } from '@/stores/terminal'

export function StatusBar() {
  const { activeWorkspace, harnessInfo, mcpStatus } = useWorkspaceStore()
  const { tabs } = useTerminalStore()

  const healthyMcp = mcpStatus.filter((m) => m.status === 'available' || m.status === 'http').length
  const totalMcp = mcpStatus.length

  return (
    <div className="flex items-center h-6 bg-surface-1 border-t border-border px-3 text-2xs text-text-muted select-none gap-4">
      {activeWorkspace && (
        <>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-status-success" />
            {activeWorkspace.name}
          </span>
          {harnessInfo && (
            <>
              <span>{harnessInfo.agents.length} agents</span>
              <span>{harnessInfo.skills.length} skills</span>
              <span>{harnessInfo.commands.length} commands</span>
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
