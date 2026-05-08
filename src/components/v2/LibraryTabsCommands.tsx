/**
 * Library → Commands tab.
 *
 * Two stacked tables: built-in slash commands and custom (team / personal)
 * commands. Custom rows carry a "⋯" menu (편집 / 복제 / 삭제). Header has
 * "+ 새 커맨드" to open CommandEditor in create mode.
 */

import { useEffect, useState } from 'react'
import { Btn } from './primitives'
import { Icon } from './icons'
import { COMMANDS_LIB, type LibCommand } from './LibraryData'
import { SectionLabel } from './Library'
import { useLibraryStore } from '@/stores/library'
import { useWorkspaceStore } from '@/stores/workspace'
import { CommandEditor } from './authoring/CommandEditor'
import {
  DeleteConfirmModal,
  LibraryRowMenu,
  UndoToast,
} from './authoring/LibraryRowMenu'

interface EditingState {
  name?: string
  duplicateFrom?: string
  initialName?: string
}

export function CommandsTab() {
  const real = useLibraryStore((s) => s.commands)
  const items = real ?? COMMANDS_LIB
  const realNames = real?.map((c) => stripSlash(c.name)) ?? []
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path) ?? ''
  const reload = useLibraryStore((s) => s.loadAll)

  const [editing, setEditing] = useState<EditingState | null>(null)
  const [deleting, setDeleting] = useState<{ name: string } | null>(null)
  const [toast, setToast] = useState<{ message: string } | null>(null)

  // Library-level "New" button → forge:library-new with tab='commands'.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string }>).detail
      if (detail?.tab === 'commands' && workspacePath) setEditing({})
    }
    window.addEventListener('forge:library-new', handler)
    return () => window.removeEventListener('forge:library-new', handler)
  }, [workspacePath])

  const builtin = items.filter((c) => c.builtin)
  const custom = items.filter((c) => !c.builtin)

  async function handleSaved() {
    setEditing(null)
    if (workspacePath) await reload(workspacePath)
  }

  async function handleDelete(name: string) {
    if (!workspacePath) return
    await window.api.harness.deleteCommand(workspacePath, name)
    setDeleting(null)
    setToast({ message: `/${name} 삭제됨 (휴지통)` })
    await reload(workspacePath)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1 }} />
        <Btn
          variant="primary"
          icon={<Icon.Plus size={11} />}
          onClick={() => setEditing({})}
          disabled={!workspacePath}
          title={workspacePath ? '새 커맨드 만들기' : '활성 워크스페이스 없음'}
        >
          새 커맨드
        </Btn>
      </div>

      <div style={{ marginBottom: 18 }}>
        <SectionLabel>Built-in ({builtin.length})</SectionLabel>
        <CommandTable items={builtin} />
      </div>
      <div>
        <SectionLabel>Custom ({custom.length})</SectionLabel>
        <CommandTable
          items={custom}
          editable
          realNames={realNames}
          onEdit={(name) => setEditing({ name })}
          onDuplicate={(name) =>
            setEditing({
              duplicateFrom: name,
              initialName: `${name}-copy`,
            })
          }
          onDelete={(name) => setDeleting({ name })}
        />
      </div>

      {editing && workspacePath && (
        <CommandEditor
          workspacePath={workspacePath}
          editing={editing.name}
          duplicateFrom={editing.duplicateFrom}
          initialName={editing.initialName}
          existingNames={realNames}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {deleting && workspacePath && (
        <DeleteConfirmModal
          kind="command"
          name={`/${deleting.name}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => handleDelete(deleting.name)}
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

interface CommandTableProps {
  items: LibCommand[]
  editable?: boolean
  realNames?: string[]
  onEdit?: (name: string) => void
  onDuplicate?: (name: string) => void
  onDelete?: (name: string) => void
}

function CommandTable({
  items,
  editable,
  realNames = [],
  onEdit,
  onDuplicate,
  onDelete,
}: CommandTableProps) {
  // Layout: command / desc / args / owner / uses (+ optional actions)
  const cols = editable ? '180px 1fr 120px 80px 100px 36px' : '180px 1fr 120px 80px 100px'
  return (
    <div
      style={{
        border: '1px solid var(--line-1)',
        borderRadius: 6,
        overflow: 'visible',
        background: 'var(--bg-2)',
      }}
    >
      <div
        className="ns mono"
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          gap: 10,
          padding: '8px 14px',
          fontSize: 9.5,
          color: 'var(--text-4)',
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--line-1)',
        }}
      >
        <span>Command</span>
        <span>Description</span>
        <span>Args</span>
        <span>Owner</span>
        <span style={{ textAlign: 'right' }}>Uses</span>
        {editable && <span />}
      </div>
      {items.map((c, i) => {
        const stripped = stripSlash(c.name)
        const isReal = realNames.includes(stripped)
        return (
          <div
            key={c.id}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 10,
              padding: '10px 14px',
              fontSize: 12,
              borderBottom: i < items.length - 1 ? '1px solid var(--line-1)' : 'none',
              alignItems: 'center',
            }}
          >
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent)',
                fontWeight: 600,
                background: 'var(--accent-dim)',
                padding: '2px 6px',
                borderRadius: 3,
                justifySelf: 'flex-start',
                fontSize: 11.5,
              }}
            >
              {c.name}
            </code>
            <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{c.desc}</span>
            <code className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>
              {c.args || '—'}
            </code>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.owner}</span>
            <span
              className="mono tabular"
              style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'right' }}
            >
              {c.uses}
            </span>
            {editable && (
              <span style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                {isReal && onEdit && onDuplicate && onDelete && (
                  <LibraryRowMenu
                    onEdit={() => onEdit(stripped)}
                    onDuplicate={() => onDuplicate(stripped)}
                    onDelete={() => onDelete(stripped)}
                  />
                )}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function stripSlash(name: string): string {
  return name.startsWith('/') ? name.slice(1) : name
}
