/**
 * Library → Hooks tab.
 *
 * List of `.claude/settings.json` hook entries. Selecting a row reveals the
 * full command in a side preview pane. Each row carries a "⋯" menu (편집 /
 * 복제 / 삭제) and the header has "+ 새 훅" to open HookEditor in create mode.
 *
 * Hook identity in settings.json is `(event, indexInEventArray)` — we recompute
 * the per-event index on the fly so the scanner's global counter doesn't leak
 * into the editor.
 */

import { useEffect, useMemo, useState } from 'react'
import { Btn, Pill } from './primitives'
import { Icon } from './icons'
import { useWorkspaceStore } from '@/stores/workspace'
import { useLibraryStore } from '@/stores/library'
import { HookEditor } from './authoring/HookEditor'
import {
  DeleteConfirmModal,
  LibraryRowMenu,
  UndoToast,
} from './authoring/LibraryRowMenu'

interface RawHook {
  id: string
  event: string
  matcher: string
  command: string
  fullCommand: string
  enabled: boolean
  /** Per-event index — added on the renderer side. */
  perEventIndex: number
}

interface EditingState {
  /** undefined → create. */
  event?: string
  index?: number
  initial?: {
    matcher?: string
    command: string
    timeout?: number
    disabled?: boolean
  }
  /** When duplicating we pre-fill from an existing hook. */
  duplicate?: boolean
}

export function HooksTab() {
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path) ?? ''
  const reload = useLibraryStore((s) => s.loadAll)

  const [hooks, setHooks] = useState<RawHook[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string>('')
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [deleting, setDeleting] = useState<RawHook | null>(null)
  const [toast, setToast] = useState<{ message: string } | null>(null)

  async function refresh() {
    if (!workspacePath) {
      setHooks([])
      setLoading(false)
      return
    }
    try {
      const raw = await window.api.harness.listHooks(workspacePath)
      // Recompute per-event indices.
      const counters = new Map<string, number>()
      const next: RawHook[] = []
      for (const h of raw as RawHook[]) {
        const i = counters.get(h.event) ?? 0
        counters.set(h.event, i + 1)
        next.push({ ...h, perEventIndex: i })
      }
      setHooks(next)
      if (!openId && next.length > 0) setOpenId(next[0].id)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath])

  const open = useMemo(() => hooks.find((h) => h.id === openId) ?? null, [hooks, openId])

  async function handleSaved() {
    setEditing(null)
    if (workspacePath) {
      await reload(workspacePath)
      await refresh()
    }
  }

  async function handleDelete(h: RawHook) {
    if (!workspacePath) return
    await window.api.harness.removeHook(workspacePath, h.event, h.perEventIndex)
    setDeleting(null)
    setToast({ message: `훅 삭제됨: ${h.event}${h.matcher ? ` (${h.matcher})` : ''}` })
    if (workspacePath) {
      await reload(workspacePath)
      await refresh()
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>
            {hooks.length} hooks
          </span>
          <div style={{ flex: 1 }} />
          <Btn
            variant="primary"
            icon={<Icon.Plus size={11} />}
            onClick={() => setEditing({})}
            disabled={!workspacePath}
            title={workspacePath ? '새 훅 추가' : '활성 워크스페이스 없음'}
          >
            새 훅
          </Btn>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>불러오는 중…</div>
        ) : hooks.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--text-3)',
              fontSize: 13,
              border: '1px dashed var(--line-2)',
              borderRadius: 8,
            }}
          >
            settings.json 에 등록된 훅이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hooks.map((h) => {
              const active = openId === h.id
              return (
                <div
                  key={h.id}
                  onClick={() => setOpenId(h.id)}
                  style={{
                    padding: '12px 14px',
                    background: active ? 'var(--bg-3)' : 'var(--bg-2)',
                    border: `1px solid ${active ? 'var(--line-3)' : 'var(--line-1)'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Icon.Bolt
                    size={13}
                    style={{
                      color: h.enabled ? 'var(--success)' : 'var(--text-4)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="mono"
                        style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600 }}
                      >
                        {h.event}
                      </span>
                      {h.matcher && (
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: 'var(--bg-3)',
                            border: '1px solid var(--line-2)',
                            color: 'var(--text-2)',
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {h.matcher}
                        </span>
                      )}
                      {!h.enabled && (
                        <Pill color="var(--text-3)">DISABLED</Pill>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-3)',
                        marginTop: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {h.command}
                    </div>
                  </div>
                  <span onClick={(e) => e.stopPropagation()}>
                    <LibraryRowMenu
                      onEdit={() =>
                        setEditing({
                          event: h.event,
                          index: h.perEventIndex,
                          initial: {
                            matcher: h.matcher,
                            command: h.fullCommand,
                            disabled: !h.enabled,
                          },
                        })
                      }
                      onDuplicate={() =>
                        setEditing({
                          duplicate: true,
                          initial: {
                            matcher: h.matcher,
                            command: h.fullCommand,
                            disabled: !h.enabled,
                          },
                        })
                      }
                      onDelete={() => setDeleting(h)}
                    />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {open && (
        <div style={previewPane}>
          <div style={previewHeader}>
            <Icon.Code size={13} style={{ color: 'var(--text-3)' }} />
            <span
              className="mono"
              style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}
            >
              {open.event}
              {open.matcher && (
                <span style={{ color: 'var(--text-3)' }}> · {open.matcher}</span>
              )}
            </span>
          </div>
          <pre style={previewCode}>{`#!/usr/bin/env bash
# event:   ${open.event}
# matcher: ${open.matcher || '(none)'}
# enabled: ${open.enabled}

${open.fullCommand}`}</pre>
        </div>
      )}

      {editing && workspacePath && (
        <HookEditor
          workspacePath={workspacePath}
          editing={
            !editing.duplicate &&
            editing.event !== undefined &&
            editing.index !== undefined &&
            editing.initial
              ? {
                  event: editing.event,
                  index: editing.index,
                  initial: editing.initial,
                }
              : undefined
          }
          duplicateFrom={
            editing.duplicate && editing.initial
              ? {
                  matcher: editing.initial.matcher,
                  command: editing.initial.command,
                  timeout: editing.initial.timeout,
                  disabled: editing.initial.disabled,
                  event: editing.event,
                }
              : undefined
          }
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {deleting && workspacePath && (
        <DeleteConfirmModal
          kind="hook"
          name={`${deleting.event}${deleting.matcher ? ` (${deleting.matcher})` : ''}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => handleDelete(deleting)}
        />
      )}

      {toast && (
        <UndoToast
          message={toast.message}
          onUndo={null}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

const previewPane: React.CSSProperties = {
  width: 380,
  flexShrink: 0,
  borderLeft: '1px solid var(--line-2)',
  background: 'var(--bg-2)',
  display: 'flex',
  flexDirection: 'column',
}

const previewHeader: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--line-1)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const previewCode: React.CSSProperties = {
  flex: 1,
  margin: 0,
  padding: 16,
  overflow: 'auto',
  fontFamily: 'var(--font-mono)',
  fontSize: 11.5,
  lineHeight: 1.6,
  color: 'var(--text-2)',
  background: '#06080b',
  whiteSpace: 'pre-wrap',
}
