/**
 * DashboardPanelWired — production wiring of the v2 dashboard.
 *
 * Re-uses the visual structure of `Placeholders.DashboardPanel` (header,
 * 6-stat grid, MCP server list, quick actions) but populates it from the
 * workspace store: `harnessInfo` (agent/skill/command/script/rule/hook
 * counts), `mcpStatus` (live `which`-checked server health), and the
 * installed/bundled harness versions.
 */
import { useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'

import { Icon } from '../icons'
import { Btn, Dot, Kbd, SectionHead } from '../primitives'

interface StatCard {
  label: string
  value: string | number
  sub: string
  icon: React.ReactNode
  accent: string
}

interface QuickAction {
  i: React.ReactNode
  t: string
  k: string
}

export interface DashboardPanelWiredProps {
  onCmdK?: () => void
}

/**
 * Map the raw `McpStatus.status` string (set by HarnessScanner: 'available',
 * 'http', 'unavailable') to a UI-level health bucket so we can pick a dot
 * color + pulse behaviour without scattering the literal strings everywhere.
 */
function mcpHealth(status: string): { color: string; pulse: boolean; label: string } {
  if (status === 'available' || status === 'http') {
    return { color: 'var(--success)', pulse: false, label: status }
  }
  if (status === 'unavailable' || status === 'errored') {
    return { color: 'var(--danger)', pulse: true, label: status }
  }
  // 'unconfigured' / unknown
  return { color: 'var(--warning)', pulse: false, label: status || 'unknown' }
}

export function DashboardPanelWired({ onCmdK }: DashboardPanelWiredProps) {
  const {
    harnessInfo,
    mcpStatus,
    installedHarnessVersion,
    bundledHarnessVersion,
    activeWorkspace,
    scanHarness,
    scanMcp,
  } = useWorkspaceStore()

  // Make sure data is fresh whenever this panel mounts (e.g. via sidebar nav).
  useEffect(() => {
    if (!activeWorkspace) return
    scanHarness()
    scanMcp()
  }, [activeWorkspace, scanHarness, scanMcp])

  // Graceful defaults for missing data — a freshly-opened workspace whose
  // scan hasn't completed yet, or a workspace without `.claude/` at all.
  const agents = harnessInfo?.agents.length ?? 0
  const skills = harnessInfo?.skills.length ?? 0
  const commands = harnessInfo?.commands.length ?? 0
  const scripts = harnessInfo?.scripts.length ?? 0
  const rules = harnessInfo?.rules.length ?? 0
  const hooks = harnessInfo
    ? Object.values(harnessInfo.hooks).reduce((a, b) => a + b, 0)
    : 0

  const mcpTotal = mcpStatus.length
  const mcpHealthy = mcpStatus.filter(
    (m) => m.status === 'available' || m.status === 'http',
  ).length
  const mcpDown = mcpTotal - mcpHealthy

  const stats: StatCard[] = [
    {
      label: 'agents',
      value: agents,
      sub: 'in pool',
      icon: <Icon.Users size={13} />,
      accent: 'var(--info)',
    },
    {
      label: 'skills',
      value: skills,
      sub: 'loaded',
      icon: <Icon.Sparkle size={13} />,
      accent: 'var(--accent)',
    },
    {
      label: 'commands',
      value: commands,
      sub: 'slash-commands',
      icon: <Icon.Code size={13} />,
      accent: 'var(--violet)',
    },
    {
      label: 'hooks',
      value: hooks,
      sub: hooks === 0 ? 'none' : 'session lifecycle',
      icon: <Icon.Bolt size={13} />,
      accent: 'var(--warning)',
    },
    {
      label: 'MCPs',
      value: mcpTotal === 0 ? '0' : `${mcpHealthy}/${mcpTotal}`,
      sub: mcpDown > 0 ? `${mcpDown} down` : mcpTotal === 0 ? 'none' : 'all healthy',
      icon: <Icon.Cube size={13} />,
      accent: mcpDown > 0 ? 'var(--danger)' : 'var(--success)',
    },
    {
      label: 'scripts',
      value: scripts,
      sub: rules > 0 ? `${rules} rules` : 'no rules',
      icon: <Icon.File size={13} />,
      accent: 'var(--text-2)',
    },
  ]

  const actions: QuickAction[] = [
    { i: <Icon.Plus size={13} />, t: '새 팀 만들기', k: '⌘N' },
    { i: <Icon.Bolt size={13} />, t: '하네스 업데이트', k: '⌘⇧U' },
    { i: <Icon.Sparkle size={13} />, t: 'skill 추가', k: '⌘⇧S' },
    { i: <Icon.Cube size={13} />, t: 'MCP 추가', k: '⌘⇧M' },
    { i: <Icon.Code size={13} />, t: 'command 작성', k: '⌘⇧C' },
    { i: <Icon.Folder size={13} />, t: '워크스페이스 추가', k: '⌘O' },
  ]

  const harnessUpdateAvailable =
    installedHarnessVersion &&
    bundledHarnessVersion &&
    installedHarnessVersion !== bundledHarnessVersion

  return (
    <div
      data-screen-label="Dashboard"
      style={{
        flex: 1,
        overflow: 'auto',
        background: 'var(--bg-1)',
        padding: 22,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--text-1)',
              letterSpacing: -0.4,
            }}
          >
            Dashboard
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-3)',
              marginTop: 4,
            }}
          >
            {activeWorkspace?.name ? `${activeWorkspace.name} · ` : ''}
            하네스 인스펙터 · MCP 상태 · 빠른 액션
            {installedHarnessVersion && ` · v${installedHarnessVersion}`}
            {harnessUpdateAvailable && (
              <span style={{ color: 'var(--accent)', marginLeft: 6 }}>
                → v{bundledHarnessVersion} available
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Btn icon={<Icon.Search size={12} />} kbd="⌘K" onClick={onCmdK}>
          Command palette
        </Btn>
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 8,
          marginBottom: 18,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              padding: 12,
              borderRadius: 6,
              background: 'var(--bg-2)',
              border: '1px solid var(--line-1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: s.accent,
                marginBottom: 8,
              }}
            >
              {s.icon}
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                {s.label}
              </span>
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--text-1)',
                letterSpacing: -0.5,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
        {/* MCP status */}
        <div
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <SectionHead
            title="MCP servers"
            sub={mcpTotal === 0 ? 'none configured' : `${mcpHealthy}/${mcpTotal} healthy`}
            right={
              <Btn
                variant="ghost"
                icon={<Icon.Refresh size={11} />}
                style={{ height: 22, fontSize: 11 }}
                onClick={() => scanMcp()}
              >
                Reconnect
              </Btn>
            }
          />
          {mcpStatus.length === 0 && (
            <div
              style={{
                padding: '12px 14px',
                fontSize: 11.5,
                color: 'var(--text-3)',
              }}
            >
              No MCP servers configured. Add one in <code>.claude/mcp.json</code>.
            </div>
          )}
          {mcpStatus.map((m) => {
            const h = mcpHealth(m.status)
            const isDown = m.status !== 'available' && m.status !== 'http'
            return (
              <div
                key={m.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--line-1)',
                }}
              >
                <Dot color={h.color} pulse={h.pulse} />
                <span
                  className="mono"
                  style={{ fontSize: 12, color: 'var(--text-1)', flex: 1 }}
                  title={m.command}
                >
                  {m.name}
                </span>
                {isDown && (
                  <span style={{ fontSize: 11, color: 'var(--danger)' }}>{h.label}</span>
                )}
                <span
                  className="mono tabular"
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={m.command}
                >
                  {m.command ?? h.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Quick actions */}
        <div
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <SectionHead title="Quick actions" />
          <div style={{ padding: 8 }}>
            {actions.map((a, i) => (
              <button
                key={i}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 5,
                  background: 'transparent',
                  border: '1px solid transparent',
                  color: 'var(--text-2)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ color: 'var(--accent)' }}>{a.i}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{a.t}</span>
                <Kbd>{a.k}</Kbd>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
