// WorkspaceV2 — top-level workspace shell.
// Layout: header + left rail (Files + TeamsRunSection) + main area (file preview / terminal tabs / run live view) + optional resource bar.
// Migrated from workspace_v2.jsx (WorkspaceV2 + WorkspaceLeftRail + WorkspaceHeaderV2 + RunBackBar + ResourceBar + ClaudeCodeSession).

import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { Btn, Pill, Kbd } from './primitives'
import { FilesPanelWired } from './wired/FilesPanelWired'
import { TeamsRunSection } from './TeamsRunSection'
import { FilePreview } from './FilePreview'
import { RunLiveView } from './RunLiveView'
import { TerminalAreaV2 } from './TerminalAreaV2'
import { useFilesStore } from '@/stores/files'
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
  const selectedFilePath = useFilesStore((s) => s.selectedFilePath)
  const selectedFileContent = useFilesStore((s) => s.selectedFileContent)
  const selectedFileTruncated = useFilesStore((s) => s.selectedFileTruncated)
  const clearSelection = useFilesStore((s) => s.clearSelection)
  const selectedFileName = selectedFilePath
    ? selectedFilePath.split('/').filter(Boolean).pop() ?? null
    : null

  // Run live view 전환을 early return 으로 처리하면 TerminalAreaV2 가
  // unmount → 메인 claude PTY 연결이 끊겨서 사용자가 "팀 들어갔다 나오면
  // 메인 세션 날아감" 으로 체감. WorkspaceV2 자체는 App.tsx 가 mount 유지
  // 하지만 그 안의 home/run 전환은 별개. 두 트리 모두 mount 유지 + display
  // 토글로 메인 터미널과 멤버 터미널 양쪽 모두 살림.
  const activeTeam = activeRunId ? runs.find((r) => r.id === activeRunId) : null
  const showRun = !!activeTeam

  return (
    <div
      data-screen-label={showRun ? 'Workspace · Run' : 'Workspace'}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-1)',
      }}
    >
      {/* Workspace home — 항상 mount, run 진입 시 display:none */}
      <div
        style={{
          flex: showRun ? 0 : 1,
          display: showRun ? 'none' : 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <WorkspaceHeaderV2 workspace={workspace} harnessUpdate={harnessUpdate} />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          <WorkspaceLeftRail
            workspacePath={workspace.path}
            runs={runs}
            onOpenRun={onOpenRun}
            onNewRun={onNewRun}
          />
          {selectedFileName ? (
            <FilePreview
              filename={selectedFileName}
              content={selectedFileContent ?? undefined}
              truncated={selectedFileTruncated}
              onClose={clearSelection}
            />
          ) : (
            <TerminalAreaV2 workspace={workspace} />
          )}
        </div>
      </div>

      {/* Run live view — 팀 선택됐을 때만 mount, home 으로 돌아가면 display:none.
         RunLiveView 가 자체 inline 헤더 (Back / team name / LIVE / branch /
         tokens / actions) 를 가지므로 별도 RunBackBar 안 그림 (옛 duplicate
         breadcrumb 결함). */}
      {activeTeam && (
        <div
          style={{
            flex: showRun ? 1 : 0,
            display: showRun ? 'flex' : 'none',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <RunLiveView team={activeTeam} onClose={onCloseRun} density={density} />
        </div>
      )}

      {showResourceBar && <ResourceBar runs={runs} />}
    </div>
  )
}

// ─── Left rail (Files + Teams) ──────────────────────────────────────

interface WorkspaceLeftRailProps {
  workspacePath: string
  runs: Team[]
  onOpenRun: (id: string) => void
  onNewRun: () => void
}

function WorkspaceLeftRail({
  workspacePath,
  runs,
  onOpenRun,
  onNewRun,
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
      <FilesPanelWired workspacePath={workspacePath} />
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
          onClick={() => {
            // Forward to Settings → Harness so the user sees the lint card +
            // diff preview (and the existing Apply flow). Mirrors the
            // dashboard quick-action wiring.
            window.dispatchEvent(
              new CustomEvent('forge:nav-settings', {
                detail: { section: 'harness' },
              }),
            )
          }}
          title="Settings → Harness 에서 업데이트 다이프 / 적용"
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
  /**
   * Optional override of the live snapshot. When supplied, the bar skips IPC
   * polling and renders these values directly — used by storybook / preview
   * surfaces and by callers that already cache the snapshot upstream.
   */
  usage?: Partial<{
    cpu: number
    memUsed: number
    memTotal: number
    diskDeltaGb: number
    ptyCount: number
  }>
}

interface ResourceSnapshot {
  cpu: number
  memUsed: number
  memTotal: number
  diskDeltaGb: number
  ptyCount: number
  ts: number
}

export function ResourceBar({ runs, usage }: ResourceBarProps) {
  // Live snapshot pulled from main every 5s. Initial state mirrors the
  // "nothing measured yet" case so the bar renders immediately at zero
  // instead of flashing fake values.
  const [snap, setSnap] = useState<ResourceSnapshot | null>(null)

  useEffect(() => {
    if (usage) return // override path — skip polling entirely
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sysApi = (window as any)?.api?.system as
      | { resourceSnapshot?: () => Promise<ResourceSnapshot> }
      | undefined
    if (typeof sysApi?.resourceSnapshot !== 'function') {
      // IPC not wired (older preload) — leave the bar in its zero state so
      // it's visibly inert rather than lying with synthetic values.
      return
    }
    const tick = async () => {
      try {
        const next = await sysApi.resourceSnapshot!()
        if (!cancelled) setSnap(next)
      } catch (err) {
        // swallow — the next interval will retry
        console.warn('[ResourceBar] snapshot failed:', err)
      }
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [usage])

  // Pick fields with usage > snap > defaults precedence so test/preview
  // overrides win without forcing the caller to supply every value.
  const cpu = usage?.cpu ?? snap?.cpu ?? 0
  const memUsed = usage?.memUsed ?? snap?.memUsed ?? 0
  const memTotalRaw = usage?.memTotal ?? snap?.memTotal ?? 0
  const memTotal = memTotalRaw > 0 ? memTotalRaw : 1 // avoid /0 in pct
  const diskDeltaGb = usage?.diskDeltaGb ?? snap?.diskDeltaGb ?? 0
  // ptyCount defaults to runs.length × 2 only if no real PTY count is known
  // — it's better to show "0 sessions" than a synthetic number, but we do
  // surface a hint so the bar isn't blank during the very first poll.
  const ptyCount = usage?.ptyCount ?? snap?.ptyCount ?? 0

  // Disk: show MB when small, GB when bigger.
  const diskLabel =
    diskDeltaGb >= 1
      ? `${diskDeltaGb.toFixed(1)} GB worktree growth`
      : `${Math.max(0, Math.round(diskDeltaGb * 1024))} MB worktree growth`

  const items = [
    { label: 'CPU', value: `${Math.round(cpu)}%`, pct: cpu / 100 },
    {
      label: 'MEM',
      value: `${memUsed.toFixed(1)} / ${memTotalRaw > 0 ? memTotalRaw.toFixed(0) : '—'} GB`,
      pct: memUsed / memTotal,
    },
    { label: 'DISK', value: diskLabel, pct: Math.min(0.5, diskDeltaGb / 50) },
    { label: 'PTY', value: `${ptyCount} sessions`, pct: ptyCount / 64 },
  ]

  // Promote bar colour to warning/danger thresholds:
  //   CPU > 80% → warning, CPU > 90% → danger
  //   MEM > 85% → warning, MEM > 95% → danger
  // Other meters use the linear gradient logic from the original design.
  function colourFor(label: string, pct: number): string {
    if (label === 'CPU') {
      if (pct > 0.9) return 'var(--danger)'
      if (pct > 0.8) return 'var(--warning)'
      return 'var(--success)'
    }
    if (label === 'MEM') {
      if (pct > 0.95) return 'var(--danger)'
      if (pct > 0.85) return 'var(--warning)'
      return 'var(--success)'
    }
    if (pct > 0.85) return 'var(--danger)'
    if (pct > 0.65) return 'var(--warning)'
    return 'var(--success)'
  }

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
                width: `${Math.min(100, Math.max(0, it.pct * 100))}%`,
                background: colourFor(it.label, it.pct),
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
        {runs.length > 0 ? ` · ${runs.length} runs` : ''}
      </span>
    </div>
  )
}

// Convenience export for Btn (eliminates "imported but unused" warnings if Btn is consumed elsewhere).
export { Btn }
