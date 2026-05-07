/**
 * TopBar — top chrome of the Forge Studio v2 shell.
 *
 * Contents (left → right):
 *   • TrafficLights (macOS window controls placeholder)
 *   • WorkspaceSwitcher (logo + name + DEV pill + dropdown of workspaces)
 *   • Center command-palette trigger (⌘K)
 *   • Model picker (sonnet-4.5 · HIGH)
 *   • Notifications · Settings
 *
 * Source: /tmp/forge_design/forge/project/src/shell.jsx (TopBar + WorkspaceSwitcher).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from './icons'
import { Pill, Kbd } from './primitives'
import type { WorkspaceSummary } from './types'

// ─── Traffic lights (visual placeholder; real ones come from frameless OS chrome) ─
function TrafficLights() {
  return (
    <div
      className="ns"
      style={{
        display: 'flex', gap: 8, paddingLeft: 14, paddingRight: 12,
        alignItems: 'center',
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <span
          key={c}
          style={{
            width: 12, height: 12, borderRadius: 999,
            background: c,
            boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.18)',
          }}
        />
      ))}
    </div>
  )
}

// ─── Workspace dropdown switcher ────────────────────────────────────────────
export interface WorkspaceSwitcherProps {
  workspace: WorkspaceSummary
  workspaces: WorkspaceSummary[]
  onSwitch: (id: string) => void
  onAddWorkspace?: () => void
  onOpenExisting?: () => void
  onManageWorkspaces?: () => void
}

export function WorkspaceSwitcher({
  workspace, workspaces, onSwitch, onAddWorkspace, onOpenExisting, onManageWorkspaces,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Fuzzy filter on name + path. Empty query → show all.
  const q = query.trim().toLowerCase()
  const filtered = q
    ? workspaces.filter(
        (w) =>
          w.name.toLowerCase().includes(q) || w.path.toLowerCase().includes(q),
      )
    : workspaces
  const showSearch = workspaces.length >= 5

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          height: 24, padding: '0 8px 0 6px', borderRadius: 5,
          background: open ? 'var(--bg-4)' : 'var(--bg-3)',
          border: `1px solid ${open ? 'var(--line-3)' : 'var(--line-2)'}`,
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--text-1)', fontSize: 12, fontWeight: 500,
          marginLeft: 4, cursor: 'pointer',
        }}
      >
        <span style={{
          width: 14, height: 14, borderRadius: 3,
          background: 'linear-gradient(135deg, var(--accent), #d94c1a)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: '#0b0e13', fontWeight: 800,
          fontFamily: 'var(--font-mono)',
        }}>F</span>
        <span style={{
          maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{workspace.name}</span>
        <Pill style={{ marginLeft: 2 }} color="var(--text-3)">DEV</Pill>
        <Icon.ChevronD
          size={12}
          style={{
            opacity: 0.5,
            transition: 'transform 120ms',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 30, left: 4, width: 360, zIndex: 80,
          background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          borderRadius: 8, boxShadow: 'var(--shadow-pop)', overflow: 'hidden',
        }}>
          <div className="ns mono" style={{
            padding: '8px 12px 4px', fontSize: 9.5, letterSpacing: 1,
            color: 'var(--text-4)', fontWeight: 600, textTransform: 'uppercase',
            borderBottom: showSearch ? 'none' : '1px solid var(--line-1)',
          }}>이 머신의 워크스페이스</div>
          {showSearch && (
            <div
              style={{
                padding: '4px 10px 8px',
                borderBottom: '1px solid var(--line-1)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon.Search size={11} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 또는 경로 검색…"
                style={{
                  flex: 1, height: 22, background: 'var(--bg-1)',
                  border: '1px solid var(--line-1)', borderRadius: 4,
                  color: 'var(--text-1)', fontSize: 11.5,
                  padding: '0 8px', outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          )}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{
                padding: '20px 12px', textAlign: 'center',
                fontSize: 11.5, color: 'var(--text-4)',
              }}>
                일치하는 워크스페이스가 없습니다.
              </div>
            )}
            {filtered.map((w, i) => {
              const cur = w.id === workspace.id
              return (
                <button
                  key={w.id}
                  onClick={() => { onSwitch(w.id); setOpen(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px',
                    background: cur ? 'var(--bg-3)' : 'transparent',
                    border: 'none',
                    borderLeft: `2px solid ${cur ? 'var(--accent)' : 'transparent'}`,
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--line-1)' : 'none',
                  }}
                >
                  <Icon.Folder size={13} style={{
                    color: cur ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, color: 'var(--text-1)',
                      fontWeight: cur ? 600 : 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {w.name}
                    </div>
                    <div className="mono" style={{
                      fontSize: 10.5, color: 'var(--text-4)', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {w.path} · <Icon.Branch size={9} style={{ verticalAlign: -1 }} /> {w.branch} · harness {w.harness}
                    </div>
                  </div>
                  {cur && <Icon.Check size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                  {!cur && w.harness !== '0.3.9' && (
                    <Pill color="var(--warning)" style={{ height: 14, fontSize: 9, flexShrink: 0 }}>
                      UPDATE
                    </Pill>
                  )}
                </button>
              )
            })}
          </div>
          <div style={{ borderTop: '1px solid var(--line-1)', background: 'var(--bg-1)' }}>
            <button
              onClick={() => { setOpen(false); onAddWorkspace?.() }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px',
                background: 'transparent', border: 'none',
                display: 'flex', alignItems: 'center', gap: 10,
                color: 'var(--text-2)', fontSize: 12, cursor: 'pointer',
              }}
            >
              <Icon.Plus size={12} /> 새 워크스페이스 추가...
            </button>
            <button
              onClick={() => {
                setOpen(false)
                ;(onOpenExisting ?? onAddWorkspace)?.()
              }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px',
                background: 'transparent', border: 'none',
                display: 'flex', alignItems: 'center', gap: 10,
                color: 'var(--text-2)', fontSize: 12, cursor: 'pointer',
                borderTop: '1px solid var(--line-1)',
              }}
            >
              <Icon.Folder size={12} /> 기존 폴더 열기...
            </button>
            <button
              onClick={() => { setOpen(false); onManageWorkspaces?.() }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px',
                background: 'transparent', border: 'none',
                display: 'flex', alignItems: 'center', gap: 10,
                color: 'var(--text-2)', fontSize: 12, cursor: 'pointer',
                borderTop: '1px solid var(--line-1)',
              }}
            >
              <Icon.Cog size={12} /> 워크스페이스 관리...
              <span style={{ flex: 1 }} />
              <Kbd>⌘,</Kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TopBar ──────────────────────────────────────────────────────────────────
export interface TopBarProps {
  workspace: WorkspaceSummary
  workspaces: WorkspaceSummary[]
  onCmdK: () => void
  onSwitchWorkspace: (id: string) => void
  onOpenSettings?: () => void
  onAddWorkspace?: () => void
  /**
   * Optional handler for "기존 폴더 열기". If omitted, the dropdown falls
   * back to onAddWorkspace (NewWorkspaceDialog already supports both flows).
   */
  onOpenExisting?: () => void
  /** Show a red dot on the bell icon when there are unread notifications. */
  hasNotifications?: boolean
  /** Active model name (e.g. "sonnet-4.5"). Falls back to "sonnet-4.5". */
  model?: string
  /** Reasoning effort label rendered in a pill (e.g. "HIGH"). */
  modelEffort?: string
}

export function TopBar({
  workspace,
  workspaces,
  onCmdK,
  onSwitchWorkspace,
  onOpenSettings,
  onAddWorkspace,
  onOpenExisting,
  hasNotifications = true,
  model = 'sonnet-4.5',
  modelEffort = 'HIGH',
}: TopBarProps) {
  const iconBtn: CSSProperties = {
    width: 24, height: 24, borderRadius: 5, background: 'transparent',
    border: '1px solid transparent', color: 'var(--text-2)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  }

  return (
    <div
      className="ns"
      style={{
        height: 38, display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--line-1)',
        background: 'linear-gradient(180deg, #11151c 0%, #0d1117 100%)',
        flexShrink: 0,
      }}
    >
      <TrafficLights />

      <WorkspaceSwitcher
        workspace={workspace}
        workspaces={workspaces}
        onSwitch={onSwitchWorkspace}
        onAddWorkspace={onAddWorkspace}
        onOpenExisting={onOpenExisting}
        onManageWorkspaces={onOpenSettings}
      />

      {/* Center: command palette trigger */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onCmdK}
          style={{
            width: 360, height: 24, borderRadius: 5,
            background: 'var(--bg-2)', border: '1px solid var(--line-1)',
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px',
            color: 'var(--text-3)', fontSize: 12, cursor: 'pointer',
          }}
        >
          <Icon.Search size={12} />
          <span style={{ flex: 1, textAlign: 'left' }}>
            Search files, commands, agents…
          </span>
          <Kbd>⌘</Kbd><Kbd>K</Kbd>
        </button>
      </div>

      {/* Right: harness, model, settings */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, paddingRight: 10,
      }}>
        <button style={{
          height: 24, padding: '0 8px', borderRadius: 5,
          background: 'transparent', border: '1px solid var(--line-2)',
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--text-2)', fontSize: 11.5, cursor: 'pointer',
        }}>
          <Icon.Sparkle size={12} style={{ color: 'var(--accent)' }} />
          <span className="mono" style={{ fontSize: 11 }}>{model}</span>
          <Pill style={{ background: 'transparent', border: '1px solid var(--line-2)' }}>
            {modelEffort}
          </Pill>
        </button>
        <button title="Notifications" style={{ ...iconBtn, position: 'relative' }}>
          <Icon.Bell size={14} />
          {hasNotifications && (
            <span style={{
              position: 'absolute', top: 4, right: 4, width: 6, height: 6,
              borderRadius: 999, background: 'var(--accent)',
            }} />
          )}
        </button>
        <button title="Settings" onClick={onOpenSettings} style={iconBtn}>
          <Icon.Cog size={14} />
        </button>
      </div>
    </div>
  )
}
