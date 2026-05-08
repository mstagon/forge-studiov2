/**
 * Library → Agents tab.
 *
 * Two-pane: searchable agent list (left) + detail w/ stats, skills, hooks,
 * permissions (right). Each row carries a "⋯" menu (편집 / 복제 / 삭제) and
 * the header has "+ 새 에이전트" to open AgentEditor in create mode.
 *
 * The detail pane still consumes the rich design seed when the scanner has
 * not populated extras (skills, hooks, runs, lastUsed) — those are UI-only
 * fields that won't be in real agent files.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Btn, Pill, Dot } from './primitives'
import { Icon } from './icons'
import {
  AGENTS_LIB,
  HOOKS_LIB_BY_ID,
  SKILLS_LIB_BY_ID,
  type LibAgent,
} from './LibraryData'
import { SectionLabel } from './Library'
import { useLibraryStore } from '@/stores/library'
import { useWorkspaceStore } from '@/stores/workspace'
import { AgentEditor } from './authoring/AgentEditor'
import {
  DeleteConfirmModal,
  LibraryRowMenu,
  UndoToast,
} from './authoring/LibraryRowMenu'

type OwnerFilter = 'all' | 'team' | 'you'

interface EditingState {
  /** undefined → create mode; string → existing agent name. */
  name?: string
  /** Source agent name to copy (frontmatter + body) when duplicating. */
  duplicateFrom?: string
  /** Pre-filled draft name for duplicate / create. */
  initialName?: string
}

export function AgentsTab() {
  const real = useLibraryStore((s) => s.agents)
  const items: LibAgent[] = real ?? AGENTS_LIB
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? '')
  const [filter, setFilter] = useState<OwnerFilter>('all')
  const [q, setQ] = useState('')

  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path) ?? ''
  const reload = useLibraryStore((s) => s.loadAll)

  const [editing, setEditing] = useState<EditingState | null>(null)
  const [deleting, setDeleting] = useState<{ name: string } | null>(null)
  const [toast, setToast] = useState<{ message: string } | null>(null)

  // Library-level "New" button dispatches forge:library-new — each tab listens
  // for its own kind so the editor opens without duplicating the modal.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string }>).detail
      if (detail?.tab === 'agents' && workspacePath) setEditing({})
    }
    window.addEventListener('forge:library-new', handler)
    return () => window.removeEventListener('forge:library-new', handler)
  }, [workspacePath])

  const filtered = items.filter((a) => {
    if (filter !== 'all' && a.owner !== filter) return false
    if (q && !(a.name + ' ' + a.role + ' ' + a.desc).toLowerCase().includes(q.toLowerCase())) {
      return false
    }
    return true
  })
  const selected = items.find((a) => a.id === selectedId) ?? items[0]

  // Existing names for collision check (lower-case match in the editor).
  const existingNames = items.map((a) => a.name)
  // Existing real-disk names = ones produced by the scanner. When the design
  // seed is in use the editor still gets the union list as a guard.
  const realNames = real?.map((a) => a.name) ?? []

  async function handleSaved() {
    setEditing(null)
    if (workspacePath) await reload(workspacePath)
  }

  async function handleDelete(name: string) {
    if (!workspacePath) return
    await window.api.harness.deleteAgent(workspacePath, name)
    setDeleting(null)
    setToast({ message: `${name} 삭제됨 (휴지통)` })
    await reload(workspacePath)
  }

  if (!selected && items.length === 0) {
    return (
      <div style={emptyState}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>아직 에이전트가 없습니다.</div>
        <Btn
          variant="primary"
          icon={<Icon.Plus size={11} />}
          onClick={() => setEditing({})}
          disabled={!workspacePath}
        >
          새 에이전트
        </Btn>
        {editing && workspacePath && (
          <AgentEditor
            workspacePath={workspacePath}
            existingNames={realNames}
            duplicateFrom={editing.duplicateFrom}
            initialName={editing.initialName}
            onClose={() => setEditing(null)}
            onSaved={handleSaved}
          />
        )}
      </div>
    )
  }
  if (!selected) return null

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid var(--line-1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 14px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={searchBox}>
              <Icon.Search size={12} style={{ color: 'var(--text-4)' }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search agents..."
                style={searchInput}
              />
            </div>
            <Btn
              variant="primary"
              icon={<Icon.Plus size={11} />}
              onClick={() => setEditing({})}
              disabled={!workspacePath}
              title={workspacePath ? '새 에이전트 만들기' : '활성 워크스페이스 없음'}
            >
              새
            </Btn>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(
              [
                { id: 'all', label: '전체' },
                { id: 'team', label: '팀' },
                { id: 'you', label: '나' },
              ] as { id: OwnerFilter; label: string }[]
            ).map((f) => {
              const a = filter === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: 4,
                    background: a ? 'var(--bg-3)' : 'transparent',
                    border: `1px solid ${a ? 'var(--line-3)' : 'var(--line-1)'}`,
                    color: a ? 'var(--text-1)' : 'var(--text-3)',
                    fontSize: 11,
                    fontWeight: a ? 600 : 500,
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.map((a) => {
            const sel = a.id === selectedId
            const isReal = realNames.includes(a.name)
            return (
              <div
                key={a.id}
                style={{
                  ...rowOuter,
                  background: sel ? 'var(--bg-3)' : 'transparent',
                  borderLeft: `2px solid ${sel ? a.color : 'transparent'}`,
                }}
              >
                <button
                  onClick={() => setSelectedId(a.id)}
                  style={rowMain}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 5,
                      flexShrink: 0,
                      background: a.color,
                      color: '#0b0e13',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {a.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={rowName}>{a.name}</div>
                    <div style={rowSub}>{a.role}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    {a.runs}
                  </span>
                </button>
                {isReal && (
                  <LibraryRowMenu
                    onEdit={() => setEditing({ name: a.name })}
                    onDuplicate={() =>
                      setEditing({
                        duplicateFrom: a.name,
                        initialName: `${a.name}-copy`,
                      })
                    }
                    onDelete={() => setDeleting({ name: a.name })}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
        <AgentDetail
          agent={selected}
          canEdit={realNames.includes(selected.name) && !!workspacePath}
          onEdit={() => setEditing({ name: selected.name })}
        />
      </div>

      {editing && workspacePath && (
        <AgentEditor
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
          kind="agent"
          name={deleting.name}
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

interface AgentDetailProps {
  agent: LibAgent
  canEdit: boolean
  onEdit: () => void
}

function AgentDetail({ agent, canEdit, onEdit }: AgentDetailProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
        <span
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            flexShrink: 0,
            background: agent.color,
            color: '#0b0e13',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {agent.name.slice(0, 2).toUpperCase()}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={titleStyle}>{agent.name}</h2>
            <Pill color={agent.owner === 'team' ? 'var(--info)' : 'var(--accent)'}>
              {agent.owner === 'team' ? 'TEAM' : 'YOURS'}
            </Pill>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{agent.role}</div>
          <div style={descStyle}>{agent.desc}</div>
        </div>
        {canEdit && (
          <Btn variant="ghost" icon={<Icon.Code size={11} />} onClick={onEdit}>
            Edit
          </Btn>
        )}
        <Btn
          variant="primary"
          icon={<Icon.Plus size={11} />}
          onClick={() => {
            // "Add to run" wires to the team-create wizard — prefill this
            // single agent so the user can finalize team metadata. The
            // global forge:new-run listener in App.tsx receives the prefill.
            window.dispatchEvent(
              new CustomEvent('forge:new-run', {
                detail: { prefillMembers: [agent.id] },
              }),
            )
          }}
          title="이 agent로 새 팀 위저드 열기"
        >
          Add to run
        </Btn>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <StatCell label="model" value={agent.model} mono />
        <StatCell label="effort" value={agent.effort} />
        <StatCell label="runs" value={agent.runs} mono />
        <StatCell label="last used" value={agent.lastUsed} />
      </div>

      <SectionLabel>Skills ({agent.skills.length})</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {agent.skills.map((s) => {
          const sk = SKILLS_LIB_BY_ID[s]
          return (
            <span key={s} style={skillChip}>
              <Icon.Sparkle size={10} style={{ color: 'var(--text-4)' }} />
              {s}
              {sk && <span style={{ color: 'var(--text-4)' }}>· {sk.lines}L</span>}
            </span>
          )
        })}
      </div>

      <SectionLabel>Hooks ({agent.hooks.length})</SectionLabel>
      {agent.hooks.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>등록된 훅 없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agent.hooks.map((h) => {
            const hk = HOOKS_LIB_BY_ID[h]
            return (
              <div key={h} style={hookRow}>
                <Icon.Bolt
                  size={11}
                  style={{ color: hk?.enabled ? 'var(--success)' : 'var(--text-4)' }}
                />
                <span className="mono" style={{ color: 'var(--text-1)' }}>
                  {h}
                </span>
                <span style={{ color: 'var(--text-4)' }}>· {hk?.trigger ?? '—'}</span>
                <div style={{ flex: 1 }} />
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                  {hk?.fires ?? 0}× fired
                </span>
              </div>
            )
          })}
        </div>
      )}

      <SectionLabel>Permissions</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <PermBlock title="Allow" color="var(--success)" items={agent.cmdAllow} />
        <PermBlock title="Deny" color="var(--danger)" items={agent.cmdDeny} />
      </div>
    </>
  )
}

interface StatCellProps {
  label: string
  value: ReactNode
  mono?: boolean
}

function StatCell({ label, value, mono }: StatCellProps) {
  return (
    <div style={statCell}>
      <div className="mono ns" style={statLabel}>
        {label}
      </div>
      <div className={mono ? 'mono tabular' : 'tabular'} style={statValue}>
        {value}
      </div>
    </div>
  )
}

interface PermBlockProps {
  title: string
  color: string
  items: string[]
}

function PermBlock({ title, color, items }: PermBlockProps) {
  return (
    <div style={permBlock}>
      <div className="ns" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Dot color={color} size={6} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: 0.4 }}>
          {title}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-4)' }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-4)' }}>없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((c, i) => (
            <code key={i} style={ruleCode}>
              {c}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── styles ──────────────────────────────────────────────────────────

const searchBox = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 6,
} as const

const searchInput = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-1)',
  fontSize: 12,
} as const

const rowOuter = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  paddingRight: 10,
} as const

const rowMain = {
  flex: 1,
  textAlign: 'left' as const,
  padding: '10px 14px',
  background: 'transparent',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
}

const rowName = {
  fontSize: 12.5,
  color: 'var(--text-1)',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const rowSub = {
  fontSize: 10.5,
  color: 'var(--text-4)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const titleStyle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 600,
  color: 'var(--text-1)',
  letterSpacing: -0.3,
} as const

const descStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-2)',
  marginTop: 10,
  lineHeight: 1.5,
  textWrap: 'pretty',
}

const skillChip = {
  padding: '4px 8px',
  background: 'var(--bg-2)',
  border: '1px solid var(--line-2)',
  borderRadius: 4,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-2)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
} as const

const hookRow = {
  padding: '8px 10px',
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 5,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 12,
} as const

const statCell = {
  padding: '10px 12px',
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 6,
} as const

const statLabel = {
  fontSize: 9.5,
  letterSpacing: 1,
  color: 'var(--text-4)',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
}

const statValue = {
  fontSize: 14,
  color: 'var(--text-1)',
  fontWeight: 500,
  marginTop: 4,
} as const

const permBlock = {
  padding: '10px 12px',
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 6,
} as const

const ruleCode = {
  fontSize: 11,
  color: 'var(--text-2)',
  background: 'var(--bg-3)',
  padding: '3px 6px',
  borderRadius: 3,
  fontFamily: 'var(--font-mono)',
} as const

const emptyState: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: 32,
}
