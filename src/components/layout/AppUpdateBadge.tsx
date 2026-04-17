import { useAppUpdateStore } from '@/stores/appUpdate'
import { VscArrowUp, VscClose } from 'react-icons/vsc'

export function AppUpdateBadge() {
  const { hasUpdate, latest, current, dismissedFor, openRelease, dismiss } =
    useAppUpdateStore()

  if (!hasUpdate || !latest) return null
  if (dismissedFor === latest) return null

  return (
    <div className="flex items-center gap-1 mr-1">
      <button
        className="flex items-center gap-1 px-2 py-1 rounded bg-status-warning/15 hover:bg-status-warning/25 text-status-warning text-2xs font-medium"
        onClick={openRelease}
        title={`Open release notes for v${latest} (you're on v${current ?? '?'})`}
      >
        <VscArrowUp size={12} />
        v{latest}
      </button>
      <button
        className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-2"
        onClick={dismiss}
        title="Dismiss"
      >
        <VscClose size={10} />
      </button>
    </div>
  )
}
