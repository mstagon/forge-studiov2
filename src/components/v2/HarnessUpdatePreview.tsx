/**
 * HarnessUpdatePreview — full-screen modal that shows a side-by-side preview
 * of the bundled harness vs the workspace's `.claude/` *before* the user
 * clicks Apply on the orange HarnessBanner.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Header: from → to · counts                              │
 *   ├────────────┬─────────────────────────────────────────────┤
 *   │ file tree  │  unified diff for selected file             │
 *   │ (added /   │  (added: success, removed: danger,          │
 *   │  removed / │   context: text-3)                          │
 *   │  modified) │                                             │
 *   ├────────────┴─────────────────────────────────────────────┤
 *   │  Cancel · Apply update                                   │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Backed by `window.api.harness.previewUpdate(workspacePath)`.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Btn, Pill } from './primitives'
import { Icon } from './icons'
import { ModalHeader, ModalOverlay } from './HarnessLintPanel'

interface UpdatePreviewFile {
  rel: string
  size?: number
}

interface UpdatePreviewModified {
  rel: string
  binary: boolean
  diff: string
}

export interface UpdatePreview {
  added: UpdatePreviewFile[]
  removed: UpdatePreviewFile[]
  modified: UpdatePreviewModified[]
  unchanged: number
}

interface HarnessApi {
  previewUpdate?: (workspacePath: string) => Promise<UpdatePreview>
}

function getHarnessApi(): HarnessApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.harness as HarnessApi | undefined
}

export interface HarnessUpdatePreviewProps {
  workspacePath: string
  fromVersion?: string
  toVersion?: string
  onClose: () => void
  onApply: () => void
  applying?: boolean
}

type Bucket = 'added' | 'removed' | 'modified'

interface TreeRow {
  rel: string
  bucket: Bucket
  binary?: boolean
  diff?: string
  size?: number
}

export function HarnessUpdatePreview({
  workspacePath,
  fromVersion,
  toVersion,
  onClose,
  onApply,
  applying = false,
}: HarnessUpdatePreviewProps) {
  const [preview, setPreview] = useState<UpdatePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRel, setSelectedRel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const api = getHarnessApi()
      if (!api?.previewUpdate) {
        if (!cancelled) {
          setLoading(false)
          setError('previewUpdate IPC bridge not available.')
        }
        return
      }
      try {
        const next = await api.previewUpdate(workspacePath)
        if (cancelled) return
        setPreview(next)
        // Default to the first modified file (it's the most interesting); fall
        // back to first added file otherwise.
        const first = next.modified[0]?.rel ?? next.added[0]?.rel ?? next.removed[0]?.rel ?? null
        setSelectedRel(first)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [workspacePath])

  const rows: TreeRow[] = useMemo(() => {
    if (!preview) return []
    const out: TreeRow[] = []
    for (const f of preview.added) out.push({ rel: f.rel, bucket: 'added', size: f.size })
    for (const f of preview.removed) out.push({ rel: f.rel, bucket: 'removed', size: f.size })
    for (const f of preview.modified) {
      out.push({ rel: f.rel, bucket: 'modified', binary: f.binary, diff: f.diff })
    }
    return out
  }, [preview])

  const selected = rows.find((r) => r.rel === selectedRel) ?? null

  const counts = preview
    ? {
        added: preview.added.length,
        removed: preview.removed.length,
        modified: preview.modified.length,
        unchanged: preview.unchanged,
      }
    : { added: 0, removed: 0, modified: 0, unchanged: 0 }

  return (
    <ModalOverlay onClose={onClose}>
      <div
        style={{
          width: '95vw',
          maxWidth: 1280,
          height: '90vh',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          title="Harness update preview"
          subtitle={
            <>
              {fromVersion && toVersion ? `${fromVersion} → ${toVersion} · ` : ''}
              <span style={{ color: 'var(--success)' }}>+{counts.added}</span>
              {' / '}
              <span style={{ color: 'var(--danger)' }}>-{counts.removed}</span>
              {' / '}
              <span style={{ color: 'var(--warning)' }}>~{counts.modified}</span>
              {' · '}
              <span style={{ color: 'var(--text-4)' }}>{counts.unchanged} unchanged</span>
            </>
          }
          onClose={onClose}
        />

        {loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            Loading preview…
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 16px',
              fontSize: 12,
              color: 'var(--danger)',
              background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
            }}
          >
            {error}
          </div>
        )}

        {!loading && preview && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {/* ─── File tree ─── */}
            <div
              style={{
                width: 320,
                flexShrink: 0,
                borderRight: '1px solid var(--line-1)',
                overflow: 'auto',
                background: 'var(--bg-2)',
              }}
            >
              <FileGroup
                title="Added"
                bucket="added"
                items={preview.added.map((f) => ({ rel: f.rel, size: f.size }))}
                color="var(--success)"
                selectedRel={selectedRel}
                onSelect={setSelectedRel}
              />
              <FileGroup
                title="Removed"
                bucket="removed"
                items={preview.removed.map((f) => ({ rel: f.rel, size: f.size }))}
                color="var(--danger)"
                selectedRel={selectedRel}
                onSelect={setSelectedRel}
              />
              <FileGroup
                title="Modified"
                bucket="modified"
                items={preview.modified.map((f) => ({ rel: f.rel, binary: f.binary }))}
                color="var(--warning)"
                selectedRel={selectedRel}
                onSelect={setSelectedRel}
              />
            </div>

            {/* ─── Diff panel ─── */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-1)',
              }}
            >
              {selected ? (
                <DiffView row={selected} />
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-3)',
                    fontSize: 13,
                  }}
                >
                  Select a file from the left to view its diff.
                </div>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--line-1)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            background: 'var(--bg-2)',
          }}
        >
          <Btn variant="ghost" onClick={onClose} disabled={applying}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            icon={<Icon.Refresh size={11} />}
            onClick={onApply}
            disabled={applying || loading || !!error}
          >
            {applying ? 'Applying…' : 'Apply update'}
          </Btn>
        </div>
      </div>
    </ModalOverlay>
  )
}

interface FileGroupProps {
  title: string
  bucket: Bucket
  items: { rel: string; size?: number; binary?: boolean }[]
  color: string
  selectedRel: string | null
  onSelect: (rel: string) => void
}

function FileGroup({ title, bucket, items, color, selectedRel, onSelect }: FileGroupProps) {
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null
  return (
    <div style={{ borderBottom: '1px solid var(--line-1)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms',
            color: 'var(--text-3)',
            display: 'inline-flex',
          }}
        >
          <Icon.Chevron size={10} />
        </span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span
          className="ns mono"
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: 'var(--text-2)',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        <Pill color="var(--text-3)">{items.length}</Pill>
      </button>
      {open && (
        <div style={{ paddingBottom: 6 }}>
          {items.map((item) => {
            const active = selectedRel === item.rel
            return (
              <div
                key={`${bucket}:${item.rel}`}
                onClick={() => onSelect(item.rel)}
                title={item.rel}
                style={{
                  padding: '5px 12px 5px 30px',
                  background: active ? 'var(--bg-3)' : 'transparent',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <code
                  className="mono"
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    color: active ? 'var(--text-1)' : 'var(--text-2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    direction: 'rtl',
                    textAlign: 'left',
                  }}
                >
                  {item.rel}
                </code>
                {item.binary && (
                  <span
                    className="mono"
                    style={{ fontSize: 9, color: 'var(--text-4)' }}
                  >
                    BIN
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DiffView({ row }: { row: TreeRow }) {
  // Added / removed buckets have no actual diff — show a placeholder so the
  // user can confirm the file path before applying.
  if (row.bucket !== 'modified') {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
        <div
          style={{
            padding: '10px 14px',
            background: row.bucket === 'added' ? 'color-mix(in oklab, var(--success) 8%, var(--bg-2))' : 'color-mix(in oklab, var(--danger) 8%, var(--bg-2))',
            border: `1px solid ${row.bucket === 'added' ? 'var(--success)' : 'var(--danger)'}`,
            borderRadius: 6,
            fontSize: 12.5,
            color: 'var(--text-1)',
          }}
        >
          <code className="mono" style={{ fontSize: 12 }}>
            {row.rel}
          </code>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            {row.bucket === 'added'
              ? '새 파일이 워크스페이스에 추가됩니다.'
              : '워크스페이스에서 제거됩니다 (백업으로 보존).'}
          </div>
        </div>
      </div>
    )
  }

  if (row.binary) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--bg-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 6,
            fontSize: 12.5,
            color: 'var(--text-2)',
          }}
        >
          <code className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
            {row.rel}
          </code>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            바이너리(또는 대용량) 파일 — diff 미리보기를 생략합니다.
          </div>
        </div>
      </div>
    )
  }

  const lines = (row.diff ?? '').split(/\r?\n/)
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '14px 18px',
        background: 'var(--bg-1)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: 'var(--bg-3)',
          border: '1px solid var(--line-1)',
          borderRadius: 6,
          marginBottom: 10,
        }}
      >
        <code className="mono" style={{ fontSize: 11.5, color: 'var(--text-1)' }}>
          {row.rel}
        </code>
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: 12,
          background: 'var(--bg-2)',
          border: '1px solid var(--line-1)',
          borderRadius: 6,
          fontSize: 11.5,
          lineHeight: 1.55,
          fontFamily: 'var(--font-mono)',
          overflow: 'auto',
          whiteSpace: 'pre',
        }}
      >
        {lines.map((line, i) => (
          <DiffLine key={i} line={line} />
        ))}
      </pre>
    </div>
  )
}

function DiffLine({ line }: { line: string }) {
  let color = 'var(--text-3)'
  let bg: string | undefined
  if (line.startsWith('+++') || line.startsWith('---')) {
    color = 'var(--text-2)'
  } else if (line.startsWith('+')) {
    color = 'var(--success)'
    bg = 'color-mix(in oklab, var(--success) 10%, transparent)'
  } else if (line.startsWith('-')) {
    color = 'var(--danger)'
    bg = 'color-mix(in oklab, var(--danger) 10%, transparent)'
  } else if (line.startsWith('@@')) {
    color = 'var(--accent)'
  }
  return (
    <div
      style={{
        color,
        background: bg,
        padding: '0 4px',
      }}
    >
      {line || ' '}
    </div>
  )
}

// Re-export for explicit type consumers.
export type { UpdatePreviewFile, UpdatePreviewModified }

// Suppress unused warning for ReactNode (kept for future props).
const _R: ReactNode = null
void _R
