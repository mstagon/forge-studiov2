// WorkspaceV2 — top-level workspace shell.
// Layout: header + left rail (Files + TeamsRunSection) + main area (file preview / terminal tabs / run live view) + optional resource bar.
// Migrated from workspace_v2.jsx (WorkspaceV2 + WorkspaceLeftRail + WorkspaceHeaderV2 + RunBackBar + ResourceBar + ClaudeCodeSession).

import { useEffect, useState } from 'react'
// TODO: foundation import — provided by main session
import { Icon } from './icons'
import { Btn, Pill, Kbd } from './primitives'
import { FilesPanel } from './FilesPanel'
import { TeamsRunSection } from './TeamsRunSection'
import { FilePreview } from './FilePreview'
import { RunLiveView } from './RunLiveView'
import { TerminalAreaV2 } from './TerminalAreaV2'
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
          <TerminalAreaV2 workspace={workspace} />
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

// Convenience export for Btn (eliminates "imported but unused" warnings if Btn is consumed elsewhere).
export { Btn }
