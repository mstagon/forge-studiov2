/**
 * StatusBar — bottom status line of the Forge Studio v2 shell.
 *
 * Reads:
 *   • workspace (name + branch + ahead/behind)
 *   • harness version
 *   • MCP servers up vs total
 *   • active agents count
 *   • file metadata (encoding, EOL, language)
 *   • open tabs count
 *
 * Source: /tmp/forge_design/forge/project/src/shell.jsx (StatusBar).
 */
import { Icon } from './icons'
import { Dot } from './primitives'
import type { WorkspaceSummary } from './types'

export interface StatusBarProps {
  workspace: WorkspaceSummary
  /** Number of MCP servers currently healthy. */
  mcpOk?: number
  /** Total number of MCP servers configured. */
  mcpTotal?: number
  /** Number of currently-active agents (running, not idle). */
  agents?: number
  /** Branch override — defaults to workspace.branch. */
  branch?: string
  ahead?: number
  behind?: number
  /** Harness version (defaults to workspace.harness). */
  harness?: string
  /** Right-side file metadata (encoding · EOL · language). */
  fileMeta?: string
  /** Tab count text. */
  tabsLabel?: string
}

export function StatusBar({
  workspace,
  // v0.15 — fake 디폴트 제거: 실값이 안 들어오면 해당 세그먼트를 그리지 않는다.
  // (구버전: MCP "4/5", 'UTF-8 · LF · TypeScript' 가 하드코딩으로 항상 표시)
  mcpOk,
  mcpTotal,
  agents = 0,
  branch,
  ahead = 0,
  behind = 0,
  harness,
  fileMeta,
  tabsLabel,
}: StatusBarProps) {
  const branchLabel = branch ?? workspace.branch
  const harnessLabel = harness ?? workspace.harness

  return (
    <div
      className="ns"
      style={{
        height: 24, flexShrink: 0,
        borderTop: '1px solid var(--line-1)',
        background: 'var(--bg-1)',
        display: 'flex', alignItems: 'center', padding: '0 8px',
        fontSize: 11, color: 'var(--text-3)', gap: 12,
        fontFamily: 'var(--font-mono)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Dot color="var(--success)" size={6} />
        <span style={{ color: 'var(--text-2)' }}>{workspace.name}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon.Branch size={11} />
        <span>{branchLabel}</span>
        {ahead > 0 && <span style={{ color: 'var(--success)' }}>↑{ahead}</span>}
        {behind > 0 && <span style={{ color: 'var(--warning)' }}>↓{behind}</span>}
      </span>
      <span>·</span>
      <span>
        harness <span style={{ color: 'var(--text-2)' }}>{harnessLabel}</span>
      </span>
      {mcpOk != null && mcpTotal != null && (
        <>
          <span>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Dot
              color={mcpOk === mcpTotal ? 'var(--success)' : 'var(--warning)'}
              size={6}
            />
            MCP {mcpOk}/{mcpTotal}
          </span>
        </>
      )}
      <span>·</span>
      <span>{agents} agents</span>
      <div style={{ flex: 1 }} />
      {fileMeta && <span>{fileMeta}</span>}
      {tabsLabel && (
        <>
          <span>·</span>
          <span>{tabsLabel}</span>
        </>
      )}
    </div>
  )
}
