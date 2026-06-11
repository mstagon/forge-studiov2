/**
 * Shell — outer chrome of the Forge Studio v2 app.
 *
 * Layout:
 *   ┌─ TopBar ──────────────────────────────────────────────┐
 *   │  HarnessBanner (optional)                             │
 *   ├─ Sidebar(48) ─┬─ main content (children) ─────────────┤
 *   │               │                                       │
 *   ├───────────────┴─ StatusBar ───────────────────────────┤
 *   └───────────────────────────────────────────────────────┘
 *
 * Source: /tmp/forge_design/forge/project/src/shell.jsx (HarnessBanner)
 *         + /tmp/forge_design/forge/project/src/app_v2.jsx (composition).
 *
 * Wires keyboard shortcuts:
 *   ⌘1..⌘4 → switch sidebar view
 *   ⌘,     → settings
 *   ⌘N     → onNewRun (if provided)
 *   ⌘K     → onCmdK (command palette)
 *   Esc    → onCloseRun (if provided)
 */
import { useEffect, type ReactNode } from 'react'
import { Icon } from './icons'
import { Pill } from './primitives'
import { SidebarV2 } from './SidebarV2'
import { StatusBar, type StatusBarProps } from './StatusBar'
import { TopBar, type TopBarProps } from './TopBar'
import type { ViewKey, WorkspaceSummary } from './types'

// ─── HarnessBanner (orange "update available" strip) ─────────────────
export interface HarnessBannerProps {
  fromVersion?: string
  toVersion?: string
  /** "새 agent 3, skill 7, hook 2" — secondary copy. */
  summary?: string
  onUpdate?: () => void
  onViewDiff?: () => void
  onDismiss?: () => void
  /** Show a busy indicator on the Update button. */
  updating?: boolean
}

export function HarnessBanner({
  fromVersion = '0.3.7',
  toVersion = '0.3.9',
  summary = '새 agent 3, skill 7, hook 2',
  onUpdate,
  onViewDiff,
  onDismiss,
  updating = false,
}: HarnessBannerProps) {
  return (
    <div style={{
      height: 30, flexShrink: 0,
      borderBottom: '1px solid var(--accent-line)',
      background:
        'linear-gradient(180deg, color-mix(in oklab, var(--accent) 12%, var(--bg-1)) 0%, color-mix(in oklab, var(--accent) 6%, var(--bg-1)) 100%)',
      display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10,
      fontSize: 12,
    }}>
      <Icon.Bolt size={13} style={{ color: 'var(--accent)' }} />
      <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>
        하네스 업데이트 가능
      </span>
      <span className="mono" style={{ color: 'var(--text-3)', fontSize: 11 }}>
        {fromVersion} → {toVersion}
      </span>
      <span style={{ color: 'var(--text-3)' }}>·</span>
      <span style={{ color: 'var(--text-2)' }}>{summary}</span>
      <div style={{ flex: 1 }} />
      <button onClick={onViewDiff} style={{
        height: 22, padding: '0 8px', borderRadius: 4,
        background: 'transparent', border: '1px solid var(--line-2)',
        color: 'var(--text-2)', fontSize: 11.5, cursor: 'pointer',
      }}>
        diff 보기
      </button>
      <button onClick={onUpdate} disabled={updating} style={{
        height: 22, padding: '0 8px', borderRadius: 4,
        background: 'var(--accent)', color: '#0b0e13',
        border: '1px solid var(--accent)',
        fontSize: 11.5, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        cursor: updating ? 'wait' : 'pointer',
        opacity: updating ? 0.7 : 1,
      }}>
        <Icon.Refresh size={11} /> {updating ? 'Updating…' : 'Update'}
      </button>
      <button
        onClick={onDismiss}
        title="Dismiss"
        style={{
          width: 22, height: 22, borderRadius: 4,
          background: 'transparent', border: '1px solid transparent',
          color: 'var(--text-3)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Icon.X size={12} />
      </button>
    </div>
  )
}

// ─── Apply toast (visual feedback after Library composition) ─────────
export interface ApplyToastProps {
  name: string
  count: number
  onClose?: () => void
}

export function ApplyToast({ name, count, onClose }: ApplyToastProps) {
  return (
    <div style={{
      position: 'absolute', bottom: 56, left: '50%',
      transform: 'translateX(-50%)',
      padding: '10px 14px',
      background: 'var(--bg-3)', border: '1px solid var(--line-3)',
      borderRadius: 8, boxShadow: 'var(--shadow-pop)', zIndex: 70,
      fontSize: 12.5, color: 'var(--text-1)',
      display: 'inline-flex', alignItems: 'center', gap: 8,
    }}>
      <Icon.Check size={13} style={{ color: 'var(--success)' }} />
      <span>적용됨:</span>
      <span style={{ fontWeight: 600 }}>{name}</span>
      <Pill color="var(--text-3)">{count} agents</Pill>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            marginLeft: 4, width: 18, height: 18, borderRadius: 4,
            background: 'transparent', border: '1px solid transparent',
            color: 'var(--text-3)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon.X size={11} />
        </button>
      )}
    </div>
  )
}

// ─── Shell ───────────────────────────────────────────────────────────
export interface ShellProps {
  /** Currently active workspace (for TopBar + StatusBar). */
  workspace: WorkspaceSummary
  /** Full list shown in the workspace switcher dropdown. */
  workspaces: WorkspaceSummary[]
  /** Sidebar view (controlled). */
  view: ViewKey
  onView: (view: ViewKey) => void

  /** Workspace switcher callback. */
  onSwitchWorkspace: (id: string) => void
  /** Command-palette trigger (also fires on ⌘K). */
  onCmdK: () => void
  /** "New Run" trigger (⌘N). Optional — Shell only fires the shortcut if set. */
  onNewRun?: () => void
  /** Esc handler — usually closes an open run. */
  onCloseRun?: () => void
  /** Settings sidebar view shortcut (⌘,). */
  onOpenSettings?: () => void
  /** "+ workspace" link in switcher dropdown. */
  onAddWorkspace?: () => void

  /** Pass-through props for StatusBar. */
  status?: Omit<StatusBarProps, 'workspace'>
  /** Pass-through props for TopBar. */
  topBar?: Pick<TopBarProps, 'hasNotifications' | 'model' | 'modelEffort'>

  /** Optional harness-update strip (shown above the main row). */
  harnessBanner?: HarnessBannerProps | null
  /** Optional toast at the bottom of the workspace area. */
  toast?: ApplyToastProps | null

  /** Main content (one of WorkspaceV2 / GitPanel / DashboardPanel / Library / SettingsFull). */
  children: ReactNode
}

export function Shell({
  workspace,
  workspaces,
  view,
  onView,
  onSwitchWorkspace,
  onCmdK,
  onNewRun,
  onCloseRun,
  onOpenSettings,
  onAddWorkspace,
  status,
  topBar,
  harnessBanner,
  toast,
  children,
}: ShellProps) {
  // Keyboard shortcuts: ⌘1..⌘4 / ⌘, / ⌘N / ⌘K / Esc
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      // Esc — close run
      if (e.key === 'Escape' && onCloseRun) {
        onCloseRun()
        return
      }
      if (!meta) return

      // Skip when user is typing into a text field — let the field own the keys.
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === '1') { e.preventDefault(); onView('workspace'); return }
      if (e.key === '2') { e.preventDefault(); onView('git');       return }
      if (e.key === '3') { e.preventDefault(); onView('dashboard'); return }
      // ⌘4 = Teams — 팀은 workspace 뷰 안에 살므로 workspace 로 이동
      // (CommandPalette 의 'Teams 보기 ⌘4' 와 일치)
      if (e.key === '4') { e.preventDefault(); onView('workspace'); return }
      if (e.key === ',') {
        e.preventDefault()
        if (onOpenSettings) onOpenSettings()
        else onView('settings')
        return
      }
      if (e.key.toLowerCase() === 'n' && onNewRun && !e.shiftKey) {
        e.preventDefault()
        onNewRun()
        return
      }
      if (e.key.toLowerCase() === 'k' && !e.shiftKey) {
        e.preventDefault()
        onCmdK()
        return
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onView, onCmdK, onNewRun, onCloseRun, onOpenSettings])

  return (
    <div
      className="flex flex-col h-screen"
      style={{ position: 'relative', background: 'var(--bg-0)' }}
    >
      <TopBar
        workspace={workspace}
        workspaces={workspaces}
        onCmdK={onCmdK}
        onSwitchWorkspace={onSwitchWorkspace}
        onOpenSettings={onOpenSettings ?? (() => onView('settings'))}
        onAddWorkspace={onAddWorkspace}
        {...topBar}
      />

      {harnessBanner && <HarnessBanner {...harnessBanner} />}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <SidebarV2 view={view} onView={onView} />
        {children}
      </div>

      <StatusBar workspace={workspace} {...status} />

      {toast && <ApplyToast {...toast} />}
    </div>
  )
}
