import { useWorkspaceStore } from '@/stores/workspace'
import { VscMenu, VscSearch, VscSettingsGear } from 'react-icons/vsc'
import { AppUpdateBadge } from './AppUpdateBadge'

export function TopBar() {
  const { activeWorkspace, toggleSidebar, toggleCommandPalette } = useWorkspaceStore()

  return (
    <div className="flex items-center h-10 bg-surface-1 border-b border-border select-none app-drag">
      {/* macOS traffic light spacing */}
      <div className="w-20 shrink-0" />

      <button
        className="p-1.5 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary app-no-drag"
        onClick={toggleSidebar}
      >
        <VscMenu size={16} />
      </button>

      <div className="flex-1 flex items-center justify-center">
        {activeWorkspace ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-muted">Workspace:</span>
            <span className="text-text-primary font-medium">{activeWorkspace.name}</span>
            {activeWorkspace.harnessApplied && (
              <span className="text-2xs px-1.5 py-0.5 rounded bg-status-success/10 text-status-success">
                Harness
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-text-muted">Forge Studio</span>
        )}
      </div>

      <div className="flex items-center gap-0.5 pr-3 app-no-drag">
        <AppUpdateBadge />
        <button
          className="p-1.5 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary"
          onClick={toggleCommandPalette}
          title="Command Palette (Cmd+Shift+P)"
        >
          <VscSearch size={16} />
        </button>
        <button
          className="p-1.5 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary"
          onClick={() => useWorkspaceStore.getState().setSidebarView('settings')}
          title="Settings (Cmd+,)"
        >
          <VscSettingsGear size={16} />
        </button>
      </div>
    </div>
  )
}
