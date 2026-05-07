/**
 * MergeConflictView — fullscreen overlay shown when a team merge produces
 * conflicting files. Visual stub for the v2 UI overhaul.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Header: "Merge Conflicts" + count + close                │
 *   ├────────────┬─────────────────────────────────────────────┤
 *   │ File list  │ 3-way diff (ours · merged · theirs)         │
 *   │            │                                             │
 *   ├────────────┴─────────────────────────────────────────────┤
 *   │ Footer: Use ours · Use theirs · Manual resolve · Abort   │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Resolution IPC is delegated to `onResolve` / `onAbort` — the actual diff
 * algorithm + per-file write is the backend worker's job. This component
 * only displays the conflict markers it receives.
 */
import { useState } from 'react'
import { Btn, SectionHead } from './primitives'
import { Icon } from './icons'

export interface ConflictItem {
  /** Workspace-relative path of the conflicting file. */
  file: string
  /** Branch name on the "ours" side (typically the team's merge target). */
  oursBranch: string
  /** Branch name on the "theirs" side (typically the member's worktree). */
  theirsBranch: string
  /** Raw conflict markers as returned by `git merge` — used for the diff
   *  preview. Optional so callers can stream this in lazily. */
  conflictMarkers?: string
}

export type ResolveStrategy = 'ours' | 'theirs' | 'manual'

export interface MergeConflictViewProps {
  teamId: string
  conflicts: ConflictItem[]
  /** Called when the user picks ours / theirs / manual edit for a file. */
  onResolve: (file: string, strategy: ResolveStrategy) => void
  /** Called when the user aborts the entire merge. */
  onAbort: () => void
  /** Close the overlay (eg. after the last conflict is resolved). */
  onClose?: () => void
}

export function MergeConflictView({
  teamId,
  conflicts,
  onResolve,
  onAbort,
  onClose,
}: MergeConflictViewProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    conflicts[0]?.file ?? null,
  )
  const selected = conflicts.find((c) => c.file === selectedFile) ?? null

  return (
    <div
      role="dialog"
      aria-label="Merge conflicts"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'var(--bg-1)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Header */}
      <div
        style={{
          flex: '0 0 auto',
          height: 44,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid var(--line-1)',
          background: 'var(--bg-2)',
        }}
      >
        <Icon.Diff size={14} style={{ color: 'var(--danger)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
          Merge Conflicts
        </span>
        <span
          className="mono tabular"
          style={{ fontSize: 11.5, color: 'var(--text-3)' }}
        >
          {conflicts.length} file{conflicts.length === 1 ? '' : 's'} · team {teamId}
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <Btn variant="ghost" icon={<Icon.X size={12} />} onClick={onClose}>
            Close
          </Btn>
        )}
      </div>

      {/* Body: file list (left) + diff (main) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* File list */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <SectionHead title="Conflicts" sub={`${conflicts.length}`} />
          <div style={{ overflowY: 'auto', flex: 1, padding: 6 }}>
            {conflicts.length === 0 && (
              <div
                style={{
                  padding: 18,
                  fontSize: 12,
                  color: 'var(--text-3)',
                  textAlign: 'center',
                }}
              >
                No conflicts.
              </div>
            )}
            {conflicts.map((c) => {
              const active = c.file === selectedFile
              return (
                <button
                  key={c.file}
                  onClick={() => setSelectedFile(c.file)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: active ? 'var(--bg-3)' : 'transparent',
                    border: `1px solid ${active ? 'var(--line-3)' : 'transparent'}`,
                    borderRadius: 5,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    marginBottom: 2,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-1)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.file}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    {c.oursBranch} ← {c.theirsBranch}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 3-way diff */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: '#06080b',
          }}
        >
          {selected ? (
            <DiffPanel item={selected} />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-3)',
                fontSize: 12.5,
              }}
            >
              Select a file to inspect the conflict.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          flex: '0 0 auto',
          height: 52,
          padding: '0 14px',
          borderTop: '1px solid var(--line-1)',
          background: 'var(--bg-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Btn
          variant="danger"
          icon={<Icon.X size={12} />}
          onClick={onAbort}
          title="Abort the entire merge — discards in-progress merge state"
        >
          Abort merge
        </Btn>
        <div style={{ flex: 1 }} />
        <Btn
          variant="ghost"
          icon={<Icon.Code size={12} />}
          disabled={!selected}
          onClick={() => selected && onResolve(selected.file, 'manual')}
          title="Open file in editor for manual resolve"
        >
          Manual resolve
        </Btn>
        <Btn
          variant="ghost"
          icon={<Icon.Arrow size={12} style={{ transform: 'rotate(180deg)' }} />}
          disabled={!selected}
          onClick={() => selected && onResolve(selected.file, 'ours')}
        >
          Use ours
        </Btn>
        <Btn
          variant="primary"
          icon={<Icon.Arrow size={12} />}
          disabled={!selected}
          onClick={() => selected && onResolve(selected.file, 'theirs')}
        >
          Use theirs
        </Btn>
      </div>
    </div>
  )
}

// ─── Internal: 3-column diff display ─────────────────────────────────

function DiffPanel({ item }: { item: ConflictItem }) {
  const { ours, merged, theirs } = splitConflict(item.conflictMarkers ?? '')
  const colStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--line-1)',
  }
  const headerStyle: React.CSSProperties = {
    height: 26,
    padding: '0 10px',
    background: 'var(--bg-2)',
    borderBottom: '1px solid var(--line-1)',
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--text-3)',
    fontWeight: 600,
  }
  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '8px 10px',
    fontFamily: 'var(--font-mono)',
    fontSize: 11.5,
    lineHeight: 1.5,
    color: 'var(--text-2)',
    whiteSpace: 'pre',
    minHeight: 0,
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* breadcrumb */}
      <div
        style={{
          flex: '0 0 auto',
          height: 30,
          padding: '0 14px',
          background: 'var(--bg-2)',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--text-2)',
        }}
      >
        <Icon.File size={11} style={{ color: 'var(--text-3)' }} />
        <span>{item.file}</span>
      </div>

      {/* 3 columns */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={colStyle}>
          <div style={{ ...headerStyle, color: '#5da5ff' }}>
            ours · {item.oursBranch}
          </div>
          <div style={bodyStyle}>{ours || '(no local changes)'}</div>
        </div>
        <div style={colStyle}>
          <div style={{ ...headerStyle, color: 'var(--accent)' }}>merged</div>
          <div style={bodyStyle}>{merged || '(empty merge candidate)'}</div>
        </div>
        <div style={{ ...colStyle, borderRight: 'none' }}>
          <div style={{ ...headerStyle, color: '#f0a23a' }}>
            theirs · {item.theirsBranch}
          </div>
          <div style={bodyStyle}>{theirs || '(no incoming changes)'}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Crude split of a conflict-marker blob into the 3 sides for visual preview.
 * Real conflict resolution stays in the backend — this is purely a placeholder
 * that surfaces the raw markers when the IPC call doesn't yet provide a
 * structured diff.
 */
function splitConflict(blob: string): { ours: string; merged: string; theirs: string } {
  if (!blob.includes('<<<<<<<') || !blob.includes('=======') || !blob.includes('>>>>>>>')) {
    return { ours: blob, merged: blob, theirs: blob }
  }
  const startIdx = blob.indexOf('<<<<<<<')
  const sepIdx = blob.indexOf('=======', startIdx)
  const endIdx = blob.indexOf('>>>>>>>', sepIdx)
  if (startIdx < 0 || sepIdx < 0 || endIdx < 0) {
    return { ours: blob, merged: blob, theirs: blob }
  }
  // Strip the marker line itself for cleaner output.
  const oursStart = blob.indexOf('\n', startIdx) + 1
  const theirsStart = blob.indexOf('\n', sepIdx) + 1
  const ours = blob.slice(oursStart, sepIdx)
  const theirs = blob.slice(theirsStart, endIdx)
  const merged = `${ours}\n--- merged candidate (manual edit recommended) ---\n${theirs}`
  return { ours, merged, theirs }
}
