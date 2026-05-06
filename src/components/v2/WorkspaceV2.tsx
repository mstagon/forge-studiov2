// WorkspaceV2 — top-level workspace shell.
// Layout: header + left rail (Files + TeamsRunSection) + main area (file preview / terminal tabs / run live view) + optional resource bar.
// Migrated from workspace_v2.jsx (WorkspaceV2 + WorkspaceLeftRail + WorkspaceHeaderV2 + RunBackBar + ResourceBar + ClaudeCodeSession).

import { useEffect, useState } from 'react'
// TODO: foundation import — provided by main session
import { Icon } from './icons'
import { Btn, Pill, Kbd, Dot } from './primitives'
import { FilesPanel } from './FilesPanel'
import { TeamsRunSection } from './TeamsRunSection'
import { FilePreview } from './FilePreview'
import { RunLiveView } from './RunLiveView'
import type { Team, WorkspaceSummary } from './types'

export interface WorkspaceV2Props {
  workspace: WorkspaceSummary
  runs: Team[]
  activeRunId: string | null
  onOpenRun: (id: string) => void
  onCloseRun: () => void
  onNewRun: () => void
  density?: 'compact' | 'normal' | 'spacious'
  showResourceBar?: boolean
  /** Whether to display the "Update harness" CTA in the header. */
  harnessUpdate?: boolean
}

export function WorkspaceV2({
  workspace,
  runs,
  activeRunId,
  onOpenRun,
  onCloseRun,
  onNewRun,
  density = 'normal',
  showResourceBar = true,
  harnessUpdate = true,
}: WorkspaceV2Props) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  // If a run is selected, the entire workspace becomes the live view.
  if (activeRunId) {
    const team = runs.find((r) => r.id === activeRunId)
    if (team) {
      return (
        <div
          data-screen-label="Workspace · Run"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--bg-1)',
          }}
        >
          <RunBackBar team={team} onClose={onCloseRun} />
          <RunLiveView team={team} onClose={onCloseRun} density={density} />
          {showResourceBar && <ResourceBar runs={runs} />}
        </div>
      )
    }
  }

  return (
    <div
      data-screen-label="Workspace"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-1)',
      }}
    >
      <WorkspaceHeaderV2 workspace={workspace} harnessUpdate={harnessUpdate} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <WorkspaceLeftRail
          runs={runs}
          onOpenRun={onOpenRun}
          onNewRun={onNewRun}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
        />
        {selectedFile ? (
          <FilePreview filename={selectedFile} onClose={() => setSelectedFile(null)} />
        ) : (
          <TerminalTabsArea />
        )}
      </div>
      {showResourceBar && <ResourceBar runs={runs} />}
    </div>
  )
}

// ─── Left rail (Files + Teams) ──────────────────────────────────────

interface WorkspaceLeftRailProps {
  runs: Team[]
  onOpenRun: (id: string) => void
  onNewRun: () => void
  selectedFile: string | null
  onSelectFile: (name: string) => void
}

function WorkspaceLeftRail({
  runs,
  onOpenRun,
  onNewRun,
  selectedFile,
  onSelectFile,
}: WorkspaceLeftRailProps) {
  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: '1px solid var(--line-1)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-1)',
      }}
    >
      <FilesPanel selectedFile={selectedFile} onSelectFile={onSelectFile} />
      <TeamsRunSection runs={runs} onOpenRun={onOpenRun} onNewRun={onNewRun} />
    </div>
  )
}

// ─── Workspace header ───────────────────────────────────────────────

interface WorkspaceHeaderV2Props {
  workspace: WorkspaceSummary
  harnessUpdate?: boolean
}

function WorkspaceHeaderV2({ workspace, harnessUpdate }: WorkspaceHeaderV2Props) {
  return (
    <div
      className="ns"
      style={{
        height: 34,
        flexShrink: 0,
        padding: '0 14px',
        borderBottom: '1px solid var(--line-1)',
        background: 'var(--bg-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 11.5,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <span
        className="mono"
        style={{
          color: 'var(--text-3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 280,
        }}
      >
        {workspace.path}
      </span>
      <span style={{ color: 'var(--line-3)' }}>·</span>
      <span
        className="mono"
        style={{
          color: 'var(--text-2)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <Icon.Branch size={11} /> {workspace.branch}
      </span>
      <div style={{ flex: 1 }} />
      {harnessUpdate ? (
        <button
          style={{
            height: 22,
            padding: '0 8px',
            borderRadius: 4,
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-line)',
            color: 'var(--accent)',
            fontSize: 11,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          <Icon.Bolt size={11} /> Update harness 0.3.7→0.3.9
        </button>
      ) : (
        <span
          className="mono"
          style={{ fontSize: 11, color: 'var(--text-4)', flexShrink: 0 }}
        >
          harness {workspace.harness ?? '0.3.9'}
        </span>
      )}
    </div>
  )
}

// ─── Run back bar (when a run is open) ──────────────────────────────

interface RunBackBarProps {
  team: Team
  onClose: () => void
}

function RunBackBar({ team, onClose }: RunBackBarProps) {
  const stateColor =
    team.status === 'active'
      ? 'var(--success)'
      : team.status === 'blocked'
        ? 'var(--danger)'
        : 'var(--text-3)'
  return (
    <div
      className="ns"
      style={{
        height: 36,
        flexShrink: 0,
        padding: '0 14px',
        borderBottom: '1px solid var(--line-1)',
        background: 'var(--bg-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <button
        onClick={onClose}
        style={{
          height: 24,
          padding: '0 10px',
          borderRadius: 5,
          background: 'var(--bg-3)',
          border: '1px solid var(--line-2)',
          color: 'var(--text-2)',
          fontSize: 11.5,
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          cursor: 'pointer',
        }}
      >
        <Icon.Arrow size={11} style={{ transform: 'rotate(180deg)' }} />
        Workspace
      </button>
      <span style={{ color: 'var(--line-3)' }}>›</span>
      <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>{team.name}</span>
      <Pill color={stateColor}>{team.status.toUpperCase()}</Pill>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
        <Icon.Branch size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
        {team.branch}
      </span>
      <div style={{ flex: 1 }} />
      <Kbd>esc</Kbd>
      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>로 돌아가기</span>
    </div>
  )
}

// ─── Resource bar (footer) ──────────────────────────────────────────

export interface ResourceBarProps {
  runs: Team[]
}

export function ResourceBar({ runs }: ResourceBarProps) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1500)
    return () => clearInterval(id)
  }, [])
  // Fake-fluctuating values seeded by tick
  const cpu = 28 + Math.round(Math.sin(tick / 3) * 6 + runs.length * 4)
  const mem = 6.4 + Math.sin(tick / 5) * 0.3
  const memMax = 32
  const disk = 142
  const ptys = 14 + runs.length * 2
  const items = [
    { label: 'CPU', value: `${cpu}%`, pct: cpu / 100 },
    { label: 'MEM', value: `${mem.toFixed(1)} / ${memMax} GB`, pct: mem / memMax },
    { label: 'DISK', value: `${disk} MB worktrees`, pct: 0.18 },
    { label: 'PTY', value: `${ptys} sessions`, pct: ptys / 64 },
  ]
  return (
    <div
      className="ns mono"
      style={{
        flexShrink: 0,
        height: 26,
        padding: '0 14px',
        borderTop: '1px solid var(--line-1)',
        background: 'var(--bg-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        fontSize: 10.5,
        color: 'var(--text-3)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <span style={{ color: 'var(--text-4)', fontWeight: 600, letterSpacing: 0.6 }}>
        RESOURCES
      </span>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-4)' }}>{it.label}</span>
          <span
            style={{
              display: 'inline-block',
              width: 60,
              height: 4,
              borderRadius: 2,
              background: 'var(--bg-3)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${Math.min(100, it.pct * 100)}%`,
                background:
                  it.pct > 0.85
                    ? 'var(--danger)'
                    : it.pct > 0.65
                      ? 'var(--warning)'
                      : 'var(--success)',
              }}
            />
          </span>
          <span className="tabular" style={{ color: 'var(--text-2)' }}>
            {it.value}
          </span>
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ color: 'var(--text-4)' }}>
        무제한 정책 · 자원 표시는 정직성 위주
      </span>
    </div>
  )
}

// ─── Terminal tabs area (placeholder for real PTY wiring) ───────────

function TerminalTabsArea() {
  const [tab, setTab] = useState(0)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1500)
    return () => clearInterval(id)
  }, [])
  const tabs = [
    { id: 0, name: '✻ Claude Code', live: true },
    { id: 1, name: 'pnpm dev', live: true },
    { id: 2, name: 'prisma studio', live: false },
    { id: 3, name: 'logs', live: true },
  ]
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: '#06080b',
      }}
    >
      <div
        className="ns"
        style={{
          height: 30,
          flexShrink: 0,
          background: 'var(--bg-1)',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'stretch',
          paddingLeft: 6,
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: active ? '#06080b' : 'transparent',
                borderTop: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                borderLeft: '1px solid transparent',
                borderRight: '1px solid var(--line-1)',
                color: active ? 'var(--text-1)' : 'var(--text-3)',
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              {t.live && (
                <Dot
                  color={active ? 'var(--success)' : 'var(--text-4)'}
                  pulse={active}
                  size={5}
                />
              )}
              <span>{t.name}</span>
              <Icon.X size={11} style={{ opacity: 0.4, marginLeft: 4 }} />
            </button>
          )
        })}
        <button
          style={{
            padding: '0 8px',
            color: 'var(--text-3)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Icon.Plus size={12} />
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px' }}>
          <button
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Split"
          >
            <Icon.Layers size={12} />
          </button>
          <button
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Search"
          >
            <Icon.Search size={12} />
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: 14,
          overflow: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.55,
          color: 'var(--text-2)',
        }}
      >
        <ClaudeCodeSession tick={tick} />
      </div>
    </div>
  )
}

// Mock "Claude Code" session content — visual placeholder for the terminal pane.
function ClaudeCodeSession({ tick: _tick }: { tick: number }) {
  return (
    <div>
      <div style={{ color: 'var(--text-3)' }}>
        ╭─ Claude Code · sonnet-4.5 · effort: high ─────────────────────╮
      </div>
      <div style={{ color: 'var(--text-3)' }}>
        │ harness <span style={{ color: 'var(--accent)' }}>0.3.9</span> · 18 agents · 24 skills ·
        12 commands · 5 hooks │
      </div>
      <div style={{ color: 'var(--text-3)' }}>
        ╰────────────────────────────────────────────────────────────────╯
      </div>
      <div style={{ height: 12 }} />
      <div>
        <span style={{ color: 'var(--accent)' }}>›</span>{' '}
        <span style={{ color: 'var(--text-1)' }}>
          회원가입 폼에 약관 모달을 추가해줘
        </span>
      </div>
      <div style={{ height: 8 }} />
      <div style={{ color: 'var(--text-3)' }}>● 작업을 분석합니다…</div>
      <div style={{ color: 'var(--text-3)' }}>
        {'  '}└ 읽음: lib/features/auth/widgets/signup_form.dart
      </div>
      <div style={{ color: 'var(--text-3)' }}>{'  '}└ 읽음: lib/theme/spacing.dart</div>
      <div style={{ height: 8 }} />
      <div>
        <span style={{ color: 'var(--success)' }}>✓</span> 5개의 변경사항을 제안합니다{' '}
        <span style={{ color: 'var(--text-3)' }}>(diff 보려면 d)</span>
      </div>
      <div style={{ paddingLeft: 14, color: 'var(--text-3)' }}>
        <div>
          1. <span style={{ color: 'var(--text-2)' }}>terms_modal.dart</span> 생성{' '}
          <span style={{ color: 'var(--success)' }}>+88</span>
        </div>
        <div>
          2. <span style={{ color: 'var(--text-2)' }}>signup_form.dart</span> 수정{' '}
          <span style={{ color: 'var(--success)' }}>+24</span>{' '}
          <span style={{ color: 'var(--danger)' }}>-3</span>
        </div>
        <div>
          3. <span style={{ color: 'var(--text-2)' }}>auth_provider.dart</span> 수정{' '}
          <span style={{ color: 'var(--success)' }}>+12</span>
        </div>
        <div>
          4. <span style={{ color: 'var(--text-2)' }}>l10n/ko.arb</span> 수정{' '}
          <span style={{ color: 'var(--success)' }}>+6</span>
        </div>
        <div>
          5. <span style={{ color: 'var(--text-2)' }}>l10n/en.arb</span> 수정{' '}
          <span style={{ color: 'var(--success)' }}>+6</span>
        </div>
      </div>
      <div style={{ height: 8 }} />
      <div style={{ color: 'var(--text-3)' }}>실행 시간 1m 36s · 184.3k tok</div>
      <div style={{ height: 12 }} />
      <div>
        <span style={{ color: 'var(--accent)' }}>›</span>{' '}
        <span className="blink" style={{ color: 'var(--text-1)' }}>
          ▍
        </span>
      </div>
    </div>
  )
}

// Convenience export for Btn (eliminates "imported but unused" warnings if Btn is consumed elsewhere).
export { Btn }
