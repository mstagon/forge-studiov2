import { useEffect } from 'react'
import { useGitStore } from '@/stores/git'
import { useWorkspaceStore } from '@/stores/workspace'
import { VscAdd, VscRemove, VscCheck, VscCloudUpload, VscCloudDownload, VscRefresh, VscDiscard, VscDiffAdded, VscDiffModified, VscDiffRemoved, VscNewFile } from 'react-icons/vsc'
import type { GitFileChange } from '@/types'

const STATUS_ICONS: Record<string, typeof VscDiffModified> = {
  M: VscDiffModified,
  A: VscDiffAdded,
  D: VscDiffRemoved,
  R: VscDiffModified,
  '?': VscNewFile,
}

const STATUS_COLORS: Record<string, string> = {
  M: 'text-yellow-400',
  A: 'text-green-400',
  D: 'text-red-400',
  R: 'text-blue-400',
  '?': 'text-gray-400',
}

function FileItem({ file, staged, cwd }: { file: GitFileChange | string; staged: boolean; cwd: string }) {
  const { stage, unstage, discard, viewDiff } = useGitStore()
  const isUntracked = typeof file === 'string'
  const path = isUntracked ? file : file.path
  const status = isUntracked ? '?' : file.status
  const Icon = STATUS_ICONS[status] || VscDiffModified
  const color = STATUS_COLORS[status] || 'text-text-muted'

  return (
    <div className="group flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-surface-2 transition-colors">
      <Icon size={14} className={`shrink-0 ${color}`} />
      <button
        className="flex-1 text-left text-text-secondary truncate hover:text-text-primary"
        onClick={() => !isUntracked && viewDiff(cwd, path, staged)}
        title={path}
      >
        {path.split('/').pop()}
      </button>
      <span className="text-2xs text-text-muted hidden group-hover:block truncate max-w-20">
        {path.includes('/') ? path.split('/').slice(0, -1).join('/') : ''}
      </span>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
        {staged ? (
          <button
            className="p-0.5 hover:bg-surface-3 rounded text-text-muted hover:text-text-primary"
            onClick={() => unstage(cwd, [path])}
            title="Unstage"
          >
            <VscRemove size={14} />
          </button>
        ) : (
          <>
            {!isUntracked && (
              <button
                className="p-0.5 hover:bg-surface-3 rounded text-text-muted hover:text-red-400"
                onClick={() => discard(cwd, path)}
                title="Discard changes"
              >
                <VscDiscard size={14} />
              </button>
            )}
            <button
              className="p-0.5 hover:bg-surface-3 rounded text-text-muted hover:text-text-primary"
              onClick={() => stage(cwd, [path])}
              title="Stage"
            >
              <VscAdd size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function GitSidebar() {
  const { activeWorkspace } = useWorkspaceStore()
  const {
    status, commitMessage, loading, error,
    refresh, stageAll, unstageAll, commit, push, pull, fetch,
    setCommitMessage, clearError,
  } = useGitStore()

  const cwd = activeWorkspace?.path || ''

  useEffect(() => {
    if (cwd) refresh(cwd)
  }, [cwd, refresh])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!cwd) return
    const timer = setInterval(() => {
      useGitStore.getState().refreshStatus(cwd)
    }, 5000)
    return () => clearInterval(timer)
  }, [cwd])

  if (!status?.isRepo) {
    return (
      <div className="px-3 py-4 text-xs text-text-muted">
        Not a git repository.
      </div>
    )
  }

  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length

  return (
    <div className="flex flex-col h-full">
      {/* Branch + sync */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-accent truncate flex-1">{status.branch}</span>
          {status.upstream && (
            <span className="text-2xs text-text-muted">
              {status.ahead > 0 && `↑${status.ahead}`}
              {status.behind > 0 && `↓${status.behind}`}
              {status.ahead === 0 && status.behind === 0 && '✓'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-2xs bg-surface-2 hover:bg-surface-3 rounded text-text-secondary hover:text-text-primary transition-colors"
            onClick={() => pull(cwd)}
            disabled={loading}
            title="Pull"
          >
            <VscCloudDownload size={12} /> Pull
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-2xs bg-surface-2 hover:bg-surface-3 rounded text-text-secondary hover:text-text-primary transition-colors"
            onClick={() => push(cwd)}
            disabled={loading}
            title="Push"
          >
            <VscCloudUpload size={12} /> Push
          </button>
          <button
            className="p-1 hover:bg-surface-2 rounded text-text-muted hover:text-text-primary"
            onClick={() => fetch(cwd)}
            disabled={loading}
            title="Fetch"
          >
            <VscRefresh size={14} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 bg-status-error/10 text-status-error text-2xs flex items-center justify-between">
          <span className="truncate">{error}</span>
          <button onClick={clearError} className="shrink-0 ml-1 hover:text-text-primary">×</button>
        </div>
      )}

      {/* Commit input */}
      <div className="px-3 py-2 border-b border-border">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          className="w-full bg-surface-0 text-text-primary text-xs px-2 py-1.5 rounded border border-border focus:border-accent outline-none resize-none"
          rows={3}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              commit(cwd)
            }
          }}
        />
        <button
          className="w-full mt-1.5 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors disabled:opacity-50"
          onClick={() => commit(cwd)}
          disabled={loading || !commitMessage.trim() || status.staged.length === 0}
          title="Commit (Cmd+Enter)"
        >
          <VscCheck size={14} />
          Commit ({status.staged.length} file{status.staged.length !== 1 ? 's' : ''})
        </button>
      </div>

      {/* File lists */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged */}
        {status.staged.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-3 py-1.5 text-2xs text-text-muted uppercase tracking-wider">
              <span>Staged ({status.staged.length})</span>
              <button
                className="hover:text-text-primary"
                onClick={() => unstageAll(cwd)}
                title="Unstage all"
              >
                <VscRemove size={12} />
              </button>
            </div>
            {status.staged.map((f) => (
              <FileItem key={`s-${f.path}`} file={f} staged cwd={cwd} />
            ))}
          </div>
        )}

        {/* Unstaged */}
        {status.unstaged.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-3 py-1.5 text-2xs text-text-muted uppercase tracking-wider">
              <span>Changes ({status.unstaged.length})</span>
              <button
                className="hover:text-text-primary"
                onClick={() => stageAll(cwd)}
                title="Stage all"
              >
                <VscAdd size={12} />
              </button>
            </div>
            {status.unstaged.map((f) => (
              <FileItem key={`u-${f.path}`} file={f} staged={false} cwd={cwd} />
            ))}
          </div>
        )}

        {/* Untracked */}
        {status.untracked.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-3 py-1.5 text-2xs text-text-muted uppercase tracking-wider">
              <span>Untracked ({status.untracked.length})</span>
              <button
                className="hover:text-text-primary"
                onClick={() => stageAll(cwd)}
                title="Stage all"
              >
                <VscAdd size={12} />
              </button>
            </div>
            {status.untracked.map((f) => (
              <FileItem key={`?-${f}`} file={f} staged={false} cwd={cwd} />
            ))}
          </div>
        )}

        {totalChanges === 0 && (
          <div className="px-3 py-4 text-xs text-text-muted text-center">
            Working tree clean
          </div>
        )}
      </div>
    </div>
  )
}
