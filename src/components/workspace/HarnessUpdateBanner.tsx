import { useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { VscRefresh, VscClose, VscArrowUp } from 'react-icons/vsc'

export function HarnessUpdateBanner() {
  const {
    activeWorkspace,
    bundledHarnessVersion,
    installedHarnessVersion,
    harnessUpdating,
    updateHarness,
  } = useWorkspaceStore()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ backupPath: string; version: string } | null>(null)

  if (!activeWorkspace) return null
  if (!bundledHarnessVersion) return null
  // No marker yet means workspace was created before versioning landed.
  // Treat that as "outdated" so the user can opt in to the bundled template.
  const outdated =
    installedHarnessVersion === null
      ? true
      : installedHarnessVersion !== bundledHarnessVersion
  if (!outdated) return null
  if (dismissed === activeWorkspace.id) return null

  const onUpdate = async () => {
    const result = await updateHarness()
    if (result) setLastResult(result)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-status-warning/10 border-b border-status-warning/30 text-xs">
      <VscArrowUp size={14} className="text-status-warning shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-text-primary font-medium">Harness update available</span>
        <span className="text-text-muted ml-2 truncate">
          {installedHarnessVersion
            ? `installed ${installedHarnessVersion} → bundled ${bundledHarnessVersion}`
            : `bundled ${bundledHarnessVersion} (no version marker found)`}
        </span>
        {lastResult && (
          <span className="text-status-success ml-2">
            ✓ updated. backup: {lastResult.backupPath.split('/').pop()}
          </span>
        )}
      </div>
      <button
        className="px-2 py-1 rounded bg-status-warning/20 hover:bg-status-warning/30 text-status-warning font-medium flex items-center gap-1 disabled:opacity-50"
        onClick={onUpdate}
        disabled={harnessUpdating}
      >
        <VscRefresh size={12} className={harnessUpdating ? 'animate-spin' : ''} />
        {harnessUpdating ? 'Updating…' : 'Update'}
      </button>
      <button
        className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-2"
        onClick={() => setDismissed(activeWorkspace.id)}
        title="Dismiss for this session"
      >
        <VscClose size={12} />
      </button>
    </div>
  )
}
