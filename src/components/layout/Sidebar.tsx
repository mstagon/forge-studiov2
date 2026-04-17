import { useWorkspaceStore } from '@/stores/workspace'
import { VscFolder, VscExtensions, VscGear, VscAdd, VscTrash, VscCheck, VscCircleFilled, VscGitMerge } from 'react-icons/vsc'
import { GitSidebar } from '@/components/git/GitSidebar'
import type { SidebarView } from '@/types'

const NAV_ITEMS: { view: SidebarView; icon: typeof VscFolder; label: string }[] = [
  { view: 'workspaces', icon: VscFolder, label: 'Workspaces' },
  { view: 'git', icon: VscGitMerge, label: 'Git' },
  { view: 'dashboard', icon: VscExtensions, label: 'Dashboard' },
  { view: 'settings', icon: VscGear, label: 'Settings' },
]

export function Sidebar() {
  const {
    sidebarView, setSidebarView,
    workspaces, activeWorkspace,
    setActiveWorkspace, removeWorkspace,
    setNewWorkspaceDialog, openWorkspace,
    harnessInfo,
  } = useWorkspaceStore()

  return (
    <div className="flex h-full bg-surface-1 border-r border-border">
      {/* Icon rail */}
      <div className="flex flex-col items-center w-12 py-2 gap-1 border-r border-border bg-surface-1">
        {NAV_ITEMS.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            className={`p-2 rounded-lg transition-colors ${
              sidebarView === view
                ? 'bg-accent/10 text-accent'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
            }`}
            onClick={() => setSidebarView(view)}
            title={label}
          >
            <Icon size={20} />
          </button>
        ))}
      </div>

      {/* Content panel */}
      <div className="flex flex-col w-56">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {sidebarView}
          </span>
          {sidebarView === 'workspaces' && (
            <button
              className="p-1 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary"
              onClick={() => setNewWorkspaceDialog(true)}
              title="New Workspace"
            >
              <VscAdd size={14} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {sidebarView === 'workspaces' && (
            <WorkspaceList
              workspaces={workspaces}
              activeId={activeWorkspace?.id || null}
              onSelect={(ws) => {
                setActiveWorkspace(ws)
              }}
              onRemove={removeWorkspace}
              onOpen={async () => {
                const result = await window.api.system.showOpenDialog({
                  properties: ['openDirectory'],
                  title: 'Open Workspace',
                })
                if (!result.canceled && result.filePaths[0]) {
                  openWorkspace(result.filePaths[0])
                }
              }}
            />
          )}
          {sidebarView === 'git' && (
            <GitSidebar />
          )}
          {sidebarView === 'dashboard' && harnessInfo && (
            <DashboardSummary info={harnessInfo} />
          )}
          {sidebarView === 'settings' && (
            <div className="px-3 py-2 text-xs text-text-muted">
              Settings managed via .claude/settings.json
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkspaceList({ workspaces, activeId, onSelect, onRemove, onOpen }: {
  workspaces: any[]
  activeId: string | null
  onSelect: (ws: any) => void
  onRemove: (id: string) => void
  onOpen: () => void
}) {
  return (
    <div className="flex flex-col">
      {workspaces.map((ws) => (
        <div
          key={ws.id}
          className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
            ws.id === activeId ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
          }`}
          onClick={() => onSelect(ws)}
        >
          <VscFolder size={14} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{ws.name}</div>
            <div className="text-2xs text-text-muted truncate">{ws.path}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {ws.harnessApplied && (
              <VscCheck size={12} className="text-status-success" title="Harness applied" />
            )}
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-3 rounded"
              onClick={(e) => { e.stopPropagation(); onRemove(ws.id) }}
              title="Remove from list"
            >
              <VscTrash size={12} />
            </button>
          </div>
        </div>
      ))}
      <button
        className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
        onClick={onOpen}
      >
        <VscFolder size={14} />
        Open existing folder...
      </button>
    </div>
  )
}

function DashboardSummary({ info }: { info: any }) {
  const items = [
    { label: 'Agents', count: info.agents.length, color: 'text-blue-400' },
    { label: 'Skills', count: info.skills.length, color: 'text-green-400' },
    { label: 'Commands', count: info.commands.length, color: 'text-yellow-400' },
    { label: 'Scripts', count: info.scripts.length, color: 'text-purple-400' },
    { label: 'Rules', count: info.rules.length, color: 'text-orange-400' },
    { label: 'MCP Servers', count: info.mcpServers.length, color: 'text-cyan-400' },
  ]

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary">
          <VscCircleFilled size={8} className={item.color} />
          <span className="flex-1">{item.label}</span>
          <span className="text-text-muted font-mono">{item.count}</span>
        </div>
      ))}
      <div className="border-t border-border mt-1 pt-1">
        <div className="px-3 py-1 text-2xs text-text-muted uppercase tracking-wider">Hooks</div>
        {Object.entries(info.hooks).map(([event, count]) => (
          <div key={event} className="flex items-center gap-2 px-3 py-1 text-xs text-text-secondary">
            <span className="flex-1 truncate">{event}</span>
            <span className="text-text-muted font-mono">{count as number}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
