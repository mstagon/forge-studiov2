// TeamsRunSection — collapsible "Teams" section in the workspace left rail.
// ACTIVE / PAUSED-BLOCKED groups + per-run row with avatar stack & progress.
// Migrated from workspace_v2.jsx (WorkspaceLeftRail teams half + RunRow).

import { useState } from 'react'
// TODO: foundation import — provided by main session
import { Icon } from './icons'
import { Dot, AvatarStack } from './primitives'
import type { Team } from './types'

export interface TeamsRunSectionProps {
  runs: Team[]
  onOpenRun: (id: string) => void
  onNewRun: () => void
}

export function TeamsRunSection({ runs, onOpenRun, onNewRun }: TeamsRunSectionProps) {
  const [teamsOpen, setTeamsOpen] = useState(true)
  const active = runs.filter((r) => r.status === 'active')
  const paused = runs.filter((r) => r.status === 'blocked' || r.status === 'idle')

  return (
    <>
      <button
        onClick={() => setTeamsOpen(!teamsOpen)}
        className="ns"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 10px',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--line-1)',
          color: 'var(--text-3)',
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          gap: 4,
        }}
      >
        <Icon.Chevron
          size={10}
          style={{ transform: teamsOpen ? 'rotate(90deg)' : 'none' }}
        />
        Teams
        <span
          style={{
            color: 'var(--text-4)',
            marginLeft: 6,
            textTransform: 'none',
            letterSpacing: 0,
            fontWeight: 500,
          }}
        >
          {active.length} active · {paused.length} paused
        </span>
        <span style={{ flex: 1 }} />
        <span
          onClick={(e) => {
            e.stopPropagation()
            onNewRun()
          }}
          title="New Run"
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            background: 'var(--bg-3)',
            border: '1px solid var(--line-2)',
            color: 'var(--text-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon.Plus size={10} />
        </span>
      </button>
      {teamsOpen && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {active.length > 0 && (
            <div
              className="mono ns"
              style={{
                padding: '4px 12px 2px',
                fontSize: 9,
                color: 'var(--text-4)',
                letterSpacing: 0.8,
              }}
            >
              ACTIVE
            </div>
          )}
          {active.map((r) => (
            <RunRow key={r.id} run={r} onClick={() => onOpenRun(r.id)} />
          ))}
          {paused.length > 0 && (
            <div
              className="mono ns"
              style={{
                padding: '8px 12px 2px',
                fontSize: 9,
                color: 'var(--text-4)',
                letterSpacing: 0.8,
              }}
            >
              PAUSED / BLOCKED
            </div>
          )}
          {paused.map((r) => (
            <RunRow key={r.id} run={r} onClick={() => onOpenRun(r.id)} />
          ))}
        </div>
      )}
    </>
  )
}

interface RunRowProps {
  run: Team
  onClick: () => void
}

function RunRow({ run, onClick }: RunRowProps) {
  const stateColor =
    run.status === 'active'
      ? 'var(--success)'
      : run.status === 'blocked'
        ? 'var(--danger)'
        : 'var(--text-3)'
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        background: 'transparent',
        border: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        cursor: 'pointer',
        borderLeft: '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-1)',
          fontWeight: 500,
        }}
      >
        <Dot color={stateColor} pulse={run.status === 'active' || run.status === 'blocked'} />
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {run.name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AvatarStack ids={run.members.map((m) => m.agentId)} max={4} size={16} />
        <span
          className="mono tabular"
          style={{
            fontSize: 10,
            color: 'var(--text-3)',
            marginLeft: 'auto',
          }}
        >
          {Math.round(run.progress * 100)}% · {run.lastActive}
        </span>
      </div>
    </button>
  )
}
