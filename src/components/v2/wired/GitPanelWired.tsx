/**
 * GitPanelWired — production wiring of the v2 Git panel.
 *
 * Reuses the visual language from `Placeholders.GitPanel` (Btn / Pill / Dot /
 * SectionHead, color tokens, two-column layout) but feeds it from the real
 * stores: `useGitStore` (status / commits / branches / diff / commit composer)
 * and `useWorkspaceStore` (active workspace path).
 *
 * Notes
 * -----
 * - Harness-file filter is preserved: `showHarnessFiles` toggles whether
 *   `.claude/**` etc. are visible. `Cmd+Shift+.` is wired globally in App.tsx.
 * - Diff rendering parses the raw unified-diff string returned by
 *   `window.api.git.diff` / `commitDiff`, classifying each line (`+`/`-`/`@@`)
 *   and matching the Placeholders' palette.
 */
import { useEffect, useMemo, useState } from 'react'
import { useGitStore, isHarnessPath } from '@/stores/git'
import { useWorkspaceStore } from '@/stores/workspace'
import type { GitStatus } from '@/types'

import { Icon } from '../icons'
import { Btn, Pill, SectionHead } from '../primitives'

// ─── Types & helpers ───────────────────────────────────────────────────

type FileEntry =
  | { kind: 'staged'; path: string; status: string }
  | { kind: 'unstaged'; path: string; status: string }
  | { kind: 'untracked'; path: string; status: '?' }

const STATUS_COLOR: Record<string, string> = {
  M: 'var(--warning)',
  A: 'var(--success)',
  D: 'var(--danger)',
  R: 'var(--info)',
  C: 'var(--info)',
  U: 'var(--danger)',
  '?': 'var(--text-3)',
}

function timeAgo(dateStr: string): string {
  const t = new Date(dateStr).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}m 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}주 전`
  const months = Math.floor(days / 30)
  return `${months}개월 전`
}

// ─── Real diff renderer ────────────────────────────────────────────────

interface DiffViewProps {
  diff: string
}

function RealDiffView({ diff }: DiffViewProps) {
  if (!diff) {
    return (
      <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
        Select a file to view its diff.
      </div>
    )
  }

  const lines = diff.split('\n')
  // Skip git's leading metadata noise (`diff --git`, `index`, `---`, `+++`)
  // until the first hunk header — keeps the viewer clean and matches the
  // placeholder's vibe.
  const firstHunk = lines.findIndex((l) => l.startsWith('@@'))
  const body = firstHunk === -1 ? lines : lines.slice(firstHunk)

  let oldLine = 0
  let newLine = 0

  return (
    <div>
      {body.map((line, i) => {
        let kind: ' ' | '+' | '-' | '@' = ' '
        let n: number | string = ''

        if (line.startsWith('@@')) {
          kind = '@'
          // @@ -<oldStart>,<oldLen> +<newStart>,<newLen> @@
          const m = /@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line)
          if (m) {
            oldLine = Number(m[1])
            newLine = Number(m[2])
          }
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          kind = '+'
          n = newLine
          newLine += 1
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          kind = '-'
          n = oldLine
          oldLine += 1
        } else if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
          // Drop residual headers if we couldn't slice them above.
          return null
        } else {
          n = newLine
          oldLine += 1
          newLine += 1
        }

        const bg =
          kind === '+'
            ? 'color-mix(in oklab, var(--success) 8%, transparent)'
            : kind === '-'
              ? 'color-mix(in oklab, var(--danger) 9%, transparent)'
              : kind === '@'
                ? 'var(--bg-2)'
                : 'transparent'
        const tcol =
          kind === '+'
            ? 'var(--success)'
            : kind === '-'
              ? 'var(--danger)'
              : kind === '@'
                ? 'var(--text-3)'
                : 'var(--text-2)'
        const sym = kind === '@' ? ' @@' : kind

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              background: bg,
              padding: '0 4px',
              whiteSpace: 'pre',
              color: tcol,
              minHeight: 18,
            }}
          >
            <span
              className="tabular"
              style={{
                width: 36,
                color: 'var(--text-4)',
                textAlign: 'right',
                paddingRight: 8,
              }}
            >
              {n}
            </span>
            <span style={{ width: 14, color: tcol, opacity: 0.7 }}>{sym}</span>
            <span style={{ flex: 1 }}>
              {kind === '@' ? line : line.slice(1)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main panel ────────────────────────────────────────────────────────

export interface GitPanelWiredProps {
  density?: 'compact' | 'normal' | 'spacious'
}

export function GitPanelWired({ density: _density }: GitPanelWiredProps = {}) {
  const { activeWorkspace } = useWorkspaceStore()
  const cwd = activeWorkspace?.path || ''

  const {
    status,
    commits,
    diffContent,
    diffFile,
    commitMessage,
    loading,
    error,
    showHarnessFiles,
    refresh,
    refreshStatus,
    stage,
    unstage,
    stageAll,
    discard,
    commit,
    push,
    pull,
    fetch,
    setCommitMessage,
    clearError,
    toggleHarnessFiles,
    viewDiff,
  } = useGitStore()

  const [selected, setSelected] = useState<FileEntry | null>(null)

  // Initial + view-mounted refresh.
  useEffect(() => {
    if (cwd) refresh(cwd)
  }, [cwd, refresh])

  // Light auto-refresh of status (mirrors v1 GitSidebar cadence).
  useEffect(() => {
    if (!cwd) return
    const id = setInterval(() => refreshStatus(cwd), 5000)
    return () => clearInterval(id)
  }, [cwd, refreshStatus])

  // Filter harness noise unless toggled visible.
  const filteredStatus = useMemo<GitStatus | null>(() => {
    if (!status) return null
    if (showHarnessFiles) return status
    return {
      ...status,
      staged: status.staged.filter((f) => !isHarnessPath(f.path)),
      unstaged: status.unstaged.filter((f) => !isHarnessPath(f.path)),
      untracked: status.untracked.filter((p) => !isHarnessPath(p)),
    }
  }, [status, showHarnessFiles])

  const hiddenCount = useMemo<number>(() => {
    if (!status || showHarnessFiles) return 0
    return (
      status.staged.filter((f) => isHarnessPath(f.path)).length +
      status.unstaged.filter((f) => isHarnessPath(f.path)).length +
      status.untracked.filter((p) => isHarnessPath(p)).length
    )
  }, [status, showHarnessFiles])

  const fileEntries = useMemo<FileEntry[]>(() => {
    if (!filteredStatus) return []
    const entries: FileEntry[] = []
    for (const f of filteredStatus.staged) {
      entries.push({ kind: 'staged', path: f.path, status: f.status })
    }
    for (const f of filteredStatus.unstaged) {
      entries.push({ kind: 'unstaged', path: f.path, status: f.status })
    }
    for (const p of filteredStatus.untracked) {
      entries.push({ kind: 'untracked', path: p, status: '?' })
    }
    return entries
  }, [filteredStatus])

  // Auto-select first file when status changes and nothing is selected (or the
  // previously-selected file vanished).
  useEffect(() => {
    if (fileEntries.length === 0) {
      if (selected) setSelected(null)
      return
    }
    const stillThere = selected && fileEntries.some((e) => e.path === selected.path)
    if (!stillThere) {
      const first = fileEntries[0]
      setSelected(first)
      if (cwd && first.kind !== 'untracked') {
        viewDiff(cwd, first.path, first.kind === 'staged')
      }
    }
  }, [fileEntries, selected, cwd, viewDiff])

  const onPickFile = (f: FileEntry) => {
    setSelected(f)
    if (cwd && f.kind !== 'untracked') {
      viewDiff(cwd, f.path, f.kind === 'staged')
    }
  }

  // ─── Empty / non-repo guard ─────────────────────────────────────────
  const branchLabel = filteredStatus?.branch ?? '—'
  const ahead = filteredStatus?.ahead ?? 0
  const behind = filteredStatus?.behind ?? 0

  return (
    <div
      data-screen-label="Git"
      style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        background: 'var(--bg-1)',
      }}
    >
      {/* Status / Commits column */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid var(--line-1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Branch header */}
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--line-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon.Branch size={13} style={{ color: 'var(--text-2)' }} />
          <span
            className="mono"
            style={{
              fontSize: 12,
              color: 'var(--text-1)',
              fontWeight: 600,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={branchLabel}
          >
            {branchLabel}
          </span>
          {ahead > 0 && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--success)' }}>
              ↑{ahead}
            </span>
          )}
          {behind > 0 && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--warning)' }}>
              ↓{behind}
            </span>
          )}
          <button
            onClick={toggleHarnessFiles}
            title={`${showHarnessFiles ? 'Hide' : 'Show'} harness files (⌘⇧.)`}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: 'transparent',
              border: '1px solid var(--line-2)',
              color: hiddenCount > 0 ? 'var(--accent)' : 'var(--text-3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {showHarnessFiles ? '−' : hiddenCount > 0 ? hiddenCount : '·'}
          </button>
        </div>

        {/* Pull / Push / Fetch row */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '8px 12px',
            borderBottom: '1px solid var(--line-1)',
          }}
        >
          <Btn
            variant="ghost"
            style={{ flex: 1, height: 24, fontSize: 11 }}
            onClick={() => cwd && pull(cwd)}
            disabled={loading || !cwd}
          >
            Pull
          </Btn>
          <Btn
            variant="ghost"
            style={{ flex: 1, height: 24, fontSize: 11 }}
            onClick={() => cwd && push(cwd)}
            disabled={loading || !cwd}
          >
            Push
          </Btn>
          <Btn
            variant="ghost"
            icon={<Icon.Refresh size={11} />}
            style={{ height: 24, fontSize: 11, padding: '0 6px' }}
            onClick={() => cwd && fetch(cwd)}
            disabled={loading || !cwd}
            title="Fetch"
          >
            {''}
          </Btn>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: '6px 12px',
              fontSize: 11,
              color: 'var(--danger)',
              background: 'color-mix(in oklab, var(--danger) 10%, transparent)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {error}
            </span>
            <button
              onClick={clearError}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ×
            </button>
          </div>
        )}

        {!filteredStatus?.isRepo && (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            Not a git repository.
          </div>
        )}

        {filteredStatus?.isRepo && (
          <>
            <SectionHead
              title="Changes"
              sub={
                fileEntries.length === 0
                  ? 'No changes'
                  : `${fileEntries.length} files · ${filteredStatus.staged.length} staged`
              }
              right={
                fileEntries.length > 0 ? (
                  <Btn
                    variant="ghost"
                    style={{ height: 22, fontSize: 11 }}
                    onClick={() => cwd && stageAll(cwd)}
                  >
                    Stage all
                  </Btn>
                ) : undefined
              }
            />
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', maxHeight: 280 }}>
              {fileEntries.length === 0 && (
                <div style={{ padding: 12, fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
                  Working tree clean
                </div>
              )}
              {fileEntries.map((f) => {
                const sel = selected?.path === f.path && selected?.kind === f.kind
                const cs = STATUS_COLOR[f.status] ?? 'var(--text-3)'
                return (
                  <button
                    key={`${f.kind}-${f.path}`}
                    onClick={() => onPickFile(f)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 12px',
                      textAlign: 'left',
                      background: sel ? 'var(--bg-3)' : 'transparent',
                      border: 'none',
                      borderLeft: `2px solid ${sel ? 'var(--accent)' : 'transparent'}`,
                      color: 'var(--text-2)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 14, color: cs, fontWeight: 700, fontSize: 11 }}>{f.status}</span>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: sel ? 'var(--text-1)' : 'var(--text-2)',
                      }}
                      title={f.path}
                    >
                      {f.path}
                    </span>
                    {f.kind === 'staged' ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          if (cwd) unstage(cwd, [f.path])
                        }}
                        style={{
                          fontSize: 10,
                          color: 'var(--text-3)',
                          padding: '0 4px',
                          cursor: 'pointer',
                        }}
                        title="Unstage"
                      >
                        −
                      </span>
                    ) : (
                      <>
                        {f.kind !== 'untracked' && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              if (cwd && window.confirm(`Discard changes to ${f.path}?`)) {
                                discard(cwd, f.path)
                              }
                            }}
                            style={{
                              fontSize: 10,
                              color: 'var(--text-3)',
                              padding: '0 4px',
                              cursor: 'pointer',
                            }}
                            title="Discard"
                          >
                            ↺
                          </span>
                        )}
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            if (cwd) stage(cwd, [f.path])
                          }}
                          style={{
                            fontSize: 10,
                            color: 'var(--text-3)',
                            padding: '0 4px',
                            cursor: 'pointer',
                          }}
                          title="Stage"
                        >
                          +
                        </span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Recent commits */}
            <SectionHead title="Recent commits" sub={`${commits.length}`} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {commits.length === 0 && (
                <div style={{ padding: 12, fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
                  No commits yet
                </div>
              )}
              {commits.slice(0, 30).map((c) => (
                <div
                  key={c.hash}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--line-1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11.5,
                      color: 'var(--text-1)',
                    }}
                  >
                    <span
                      className="mono"
                      style={{ color: 'var(--accent)', fontSize: 11 }}
                    >
                      {c.shortHash}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={c.message}
                    >
                      {c.message}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: 'var(--text-3)',
                      marginTop: 2,
                      display: 'flex',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 160,
                      }}
                    >
                      {c.author}
                    </span>
                    <span>·</span>
                    <span>{timeAgo(c.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Commit composer */}
        <div style={{ padding: 10, borderTop: '1px solid var(--line-1)' }}>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="commit message…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                if (cwd) commit(cwd)
              }
            }}
            style={{
              padding: '6px 8px',
              borderRadius: 5,
              background: 'var(--bg-2)',
              border: '1px solid var(--line-2)',
              color: 'var(--text-1)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              width: '100%',
              minHeight: 56,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Btn
              style={{ flex: 1 }}
              variant="primary"
              icon={<Icon.Check size={12} />}
              onClick={() => cwd && commit(cwd)}
              disabled={
                loading ||
                !cwd ||
                !commitMessage.trim() ||
                (filteredStatus?.staged.length ?? 0) === 0
              }
            >
              Commit{(filteredStatus?.staged.length ?? 0) > 0 ? ` (${filteredStatus!.staged.length})` : ''}
            </Btn>
            <Btn icon={<Icon.Sparkle size={12} />} disabled>
              AI msg
            </Btn>
          </div>
        </div>
      </div>

      {/* Diff viewer */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#06080b',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Icon.File size={13} style={{ color: 'var(--text-3)' }} />
          <span
            className="mono"
            style={{
              fontSize: 12,
              color: 'var(--text-1)',
              flex: '0 1 auto',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '60%',
            }}
            title={selected?.path ?? diffFile ?? ''}
          >
            {selected?.path ?? diffFile ?? '(no selection)'}
          </span>
          {selected && (
            <Pill
              color={
                selected.kind === 'staged'
                  ? 'var(--success)'
                  : selected.kind === 'untracked'
                    ? 'var(--text-3)'
                    : 'var(--warning)'
              }
            >
              {selected.kind}
            </Pill>
          )}
          <div style={{ flex: 1 }} />
          {selected && selected.kind !== 'untracked' && (
            <>
              <Btn
                variant="ghost"
                style={{ height: 22, fontSize: 11 }}
                onClick={() => {
                  if (cwd && window.confirm(`Discard changes to ${selected.path}?`)) {
                    discard(cwd, selected.path)
                  }
                }}
                disabled={selected.kind === 'staged'}
              >
                Discard
              </Btn>
              <Btn
                style={{ height: 22, fontSize: 11 }}
                onClick={() => {
                  if (!cwd) return
                  if (selected.kind === 'staged') unstage(cwd, [selected.path])
                  else stage(cwd, [selected.path])
                }}
              >
                {selected.kind === 'staged' ? 'Unstage' : 'Stage'}
              </Btn>
            </>
          )}
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 14,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          <RealDiffView diff={diffContent} />
        </div>
      </div>
    </div>
  )
}
