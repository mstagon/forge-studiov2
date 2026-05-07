// RunLiveView — TeamLiveView from teams.jsx.
// Members rail (left) + tmux split grid (center) + activity feed (right) + control bar.
//
// Note: this is the design "live view" — it visualizes a Run's parallel agents
// using mock terminal lines + a tick-driven activity feed. The real PTY wiring is
// a future integration; for now it consumes seed data via props.

import { useEffect, useMemo, useState } from 'react'
// TODO: foundation import — provided by main session
import { Icon } from './icons'
import {
  Btn,
  Pill,
  Dot,
  AgentBadge,
  Kbd,
  SectionHead,
  STATE_COLOR,
  STATE_LABEL,
} from './primitives'
import { AGENT_BY_ID, ACTIVITY, TERMINAL_LINES } from './data'
import type { Team, TeamMember, ActivityItem, MemberState, TerminalLine } from './types'

export interface RunLiveViewProps {
  team: Team
  onClose: () => void
  density?: 'compact' | 'normal' | 'spacious'
  /** Optional override of the activity feed; defaults to seed `ACTIVITY`. */
  activity?: ActivityItem[]
  /** Optional override of pane terminal lines by agentId; defaults to seed `TERMINAL_LINES`. */
  terminalLines?: Record<string, TerminalLine[]>
}

export function RunLiveView({
  team,
  onClose,
  activity = ACTIVITY,
  terminalLines = TERMINAL_LINES,
}: RunLiveViewProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [feedOpen, setFeedOpen] = useState(true)
  const [paused, setPaused] = useState(false)

  // Live tick — drives terminal scroll + activity feed
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setTick((t) => t + 1), 1200)
    return () => clearInterval(id)
  }, [paused])

  return (
    <div
      data-screen-label="Team Live View"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-1)',
      }}
    >
      {/* Live view header / control bar */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--line-1)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          onClick={onClose}
          style={{
            height: 28,
            padding: '0 10px 0 8px',
            borderRadius: 6,
            color: 'var(--text-1)',
            background: 'var(--bg-3)',
            border: '1px solid var(--line-2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
          }}
          title="Back to workspace (Esc)"
        >
          <Icon.Chevron size={14} style={{ transform: 'rotate(180deg)' }} />
          <span>Back</span>
          <Kbd style={{ marginLeft: 2 }}>esc</Kbd>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dot color={STATE_COLOR.active} pulse />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{team.name}</span>
        </div>
        <Pill color="var(--accent)">LIVE</Pill>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          <Icon.Branch size={11} style={{ verticalAlign: -1 }} /> {team.branch} · {team.worktree} ·
          merge: {team.merge}
        </span>
        <div style={{ flex: 1 }} />
        <span
          className="mono tabular"
          style={{ fontSize: 11, color: 'var(--text-3)' }}
        >
          {(team.tokens / 1000).toFixed(1)}k tok · {team.durationMin}m
        </span>
        <Btn
          variant="ghost"
          icon={paused ? <Icon.Play size={12} /> : <Icon.Pause size={12} />}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? 'Resume' : 'Pause all'}
        </Btn>
        <Btn variant="ghost" icon={<Icon.Diff size={12} />}>
          Diff
        </Btn>
        <Btn variant="primary" icon={<Icon.Check size={12} />}>
          Merge
        </Btn>
        <Btn variant="ghost" icon={<Icon.X size={12} />}>
          Close team
        </Btn>
      </div>

      {/* Body: 3 columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Members rail */}
        <div
          style={{
            width: 248,
            flexShrink: 0,
            borderRight: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <SectionHead title="Members" sub={`${team.members.length}`} />
          <div style={{ overflowY: 'auto', flex: 1, padding: 8 }}>
            {team.members.map((m) => (
              <AgentCard
                key={m.agentId}
                member={m}
                selected={selectedAgentId === m.agentId}
                onClick={() =>
                  setSelectedAgentId(m.agentId === selectedAgentId ? null : m.agentId)
                }
              />
            ))}
          </div>
          <div
            style={{
              padding: '8px 12px',
              borderTop: '1px solid var(--line-1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 11,
              color: 'var(--text-3)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>tokens</span>
              <span style={{ color: 'var(--text-2)' }}>{team.tokens.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>duration</span>
              <span style={{ color: 'var(--text-2)' }}>{team.durationMin}m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>files touched</span>
              <span style={{ color: 'var(--text-2)' }}>
                {team.members.reduce((a, m) => a + m.files, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Center: tmux grid */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#06080b',
          }}
        >
          <TmuxGrid
            members={team.members}
            tick={tick}
            selectedAgentId={selectedAgentId}
            onSelect={setSelectedAgentId}
            terminalLines={terminalLines}
          />
        </div>

        {/* Right: activity feed */}
        {feedOpen && (
          <div
            style={{
              width: 320,
              flexShrink: 0,
              borderLeft: '1px solid var(--line-1)',
              background: 'var(--bg-1)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <SectionHead
              title="Activity"
              sub="real-time"
              right={
                <button
                  onClick={() => setFeedOpen(false)}
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
                >
                  <Icon.X size={12} />
                </button>
              }
            />
            <ActivityFeed tick={tick} paused={paused} items={activity} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Agent card (members rail) ──────────────────────────────────────

interface AgentCardProps {
  member: TeamMember
  selected: boolean
  onClick: () => void
}

function AgentCard({ member, selected, onClick }: AgentCardProps) {
  const a = AGENT_BY_ID[member.agentId]
  const stateC = STATE_COLOR[member.state]
  if (!a) return null
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: 9,
        background: selected ? 'var(--bg-3)' : 'transparent',
        border: `1px solid ${selected ? 'var(--line-3)' : 'transparent'}`,
        borderRadius: 6,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginBottom: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AgentBadge agentId={member.agentId} size={24} glow={member.state === 'active'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-1)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              className="mono"
            >
              {a.name}
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{a.role}</div>
        </div>
        <Dot
          color={stateC}
          pulse={member.state === 'active' || member.state === 'blocked'}
        />
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--text-2)',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
        }}
      >
        {member.task}
      </div>
      {member.blockedReason && (
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--danger)',
            background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
            border: '1px solid color-mix(in oklab, var(--danger) 25%, transparent)',
            borderRadius: 4,
            padding: '5px 7px',
          }}
        >
          {member.blockedReason}
        </div>
      )}
      <div
        className="mono tabular"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--text-3)',
        }}
      >
        <span>{member.tokens > 0 ? `${(member.tokens / 1000).toFixed(1)}k` : '—'} tok</span>
        <span>{member.files} 파일</span>
        <span style={{ color: stateC, fontWeight: 600, letterSpacing: 0.3 }}>
          {STATE_LABEL[member.state]}
        </span>
      </div>
    </button>
  )
}

// ─── tmux split grid ────────────────────────────────────────────────

interface TmuxGridProps {
  members: TeamMember[]
  tick: number
  selectedAgentId: string | null
  onSelect: (id: string | null) => void
  terminalLines: Record<string, TerminalLine[]>
}

function TmuxGrid({ members, tick, selectedAgentId, onSelect, terminalLines }: TmuxGridProps) {
  const layout = useMemo(() => {
    const n = members.length
    if (n <= 1) return { cols: 1, rows: 1 }
    if (n === 2) return { cols: 2, rows: 1 }
    if (n === 3) return { cols: 3, rows: 1 }
    if (n === 4) return { cols: 2, rows: 2 }
    if (n <= 6) return { cols: 3, rows: 2 }
    return { cols: 4, rows: Math.ceil(n / 4) }
  }, [members.length])

  if (selectedAgentId) {
    const focused = members.find((m) => m.agentId === selectedAgentId)
    const others = members.filter((m) => m.agentId !== selectedAgentId)
    if (!focused) return null
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 8,
          gap: 8,
          minHeight: 0,
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          <TmuxPane
            member={focused}
            tick={tick}
            expanded
            onClose={() => onSelect(null)}
            terminalLines={terminalLines}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, height: 110 }}>
          {others.map((m) => (
            <div key={m.agentId} style={{ flex: 1, minWidth: 0 }}>
              <TmuxPane
                member={m}
                tick={tick}
                compact
                onClick={() => onSelect(m.agentId)}
                terminalLines={terminalLines}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: 6,
        padding: 8,
        minHeight: 0,
      }}
    >
      {members.map((m) => (
        <TmuxPane
          key={m.agentId}
          member={m}
          tick={tick}
          onClick={() => onSelect(m.agentId)}
          terminalLines={terminalLines}
        />
      ))}
    </div>
  )
}

interface TmuxPaneProps {
  member: TeamMember
  tick: number
  compact?: boolean
  expanded?: boolean
  onClick?: () => void
  onClose?: () => void
  terminalLines: Record<string, TerminalLine[]>
}

function TmuxPane({
  member,
  tick,
  compact,
  expanded,
  onClick,
  onClose,
  terminalLines,
}: TmuxPaneProps) {
  const a = AGENT_BY_ID[member.agentId]
  const lines: TerminalLine[] =
    terminalLines[member.agentId] ?? [
      { c: 'var(--text-3)', t: '$ # waiting…' },
      { c: 'var(--text-3)', t: '$ _' },
    ]
  const visibleCount = compact ? 4 : expanded ? 18 : 9
  const offset = member.state === 'active' ? tick : 0
  const slice: TerminalLine[] = []
  for (let i = 0; i < visibleCount; i++) {
    const idx = (offset + i) % lines.length
    slice.push(lines[idx])
  }

  const stateC = STATE_COLOR[member.state]
  const isActive = member.state === 'active'

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 6,
        background: '#0a0d12',
        border: `1px solid ${
          isActive
            ? 'color-mix(in oklab, var(--success) 30%, var(--line-2))'
            : 'var(--line-1)'
        }`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        boxShadow: isActive
          ? '0 0 0 1px color-mix(in oklab, var(--success) 18%, transparent), inset 0 0 32px rgba(74,222,128,0.04)'
          : 'none',
      }}
    >
      {/* pane title */}
      <div
        className="ns"
        style={{
          height: 22,
          flexShrink: 0,
          background: 'var(--bg-2)',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 6,
          fontSize: 10.5,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-3)',
        }}
      >
        <AgentBadge agentId={member.agentId} size={14} />
        <span style={{ color: 'var(--text-2)' }}>{a?.name ?? member.agentId}</span>
        <span>·</span>
        <span
          style={{
            color: 'var(--text-3)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {member.pane}
        </span>
        <div style={{ flex: 1 }} />
        <Dot color={stateC} pulse={isActive || member.state === 'blocked'} />
        <span
          style={{
            color: stateC,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {STATE_LABEL[member.state]}
        </span>
        {expanded && onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            style={{
              width: 18,
              height: 18,
              marginLeft: 4,
              borderRadius: 3,
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon.X size={11} />
          </button>
        )}
      </div>
      {/* body */}
      <div
        style={{
          flex: 1,
          padding: compact ? '6px 8px' : '8px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: compact ? 9.5 : expanded ? 12 : 10.5,
          lineHeight: 1.5,
          color: 'var(--text-2)',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {slice.map((l, i) => (
          <div
            key={i}
            style={{
              color: l.c,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {l.t}
            {i === slice.length - 1 && isActive && (
              <span className="blink" style={{ color: 'var(--text-1)' }}>
                ▍
              </span>
            )}
          </div>
        ))}
      </div>
      {/* blocked overlay */}
      {member.state === 'blocked' && (
        <div
          style={{
            position: 'absolute',
            top: 22,
            right: 8,
            padding: '3px 7px',
            background: 'color-mix(in oklab, var(--danger) 15%, var(--bg-2))',
            border: '1px solid color-mix(in oklab, var(--danger) 35%, var(--line-2))',
            borderRadius: 4,
            fontSize: 10,
            color: 'var(--danger)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
          }}
        >
          ⚠ 결정 대기
        </div>
      )}
    </div>
  )
}

// ─── Activity feed (right column) ───────────────────────────────────

interface ActivityFeedProps {
  tick: number
  paused: boolean
  items: ActivityItem[]
}

const KIND_COLOR: Record<ActivityItem['kind'], string> = {
  edit: 'var(--text-2)',
  commit: 'var(--success)',
  blocked: 'var(--danger)',
  decision: 'var(--accent)',
  tool: 'var(--info)',
  queued: 'var(--text-3)',
  done: 'var(--success)',
}

const KIND_LABEL: Record<ActivityItem['kind'], string> = {
  edit: 'edit',
  commit: 'commit',
  blocked: 'block',
  decision: 'decision',
  tool: 'exec',
  queued: 'queue',
  done: 'done',
}

function ActivityFeed({ tick, paused, items }: ActivityFeedProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
      {items.map((it, i) => {
        const a = AGENT_BY_ID[it.agent]
        const isNew = !paused && i === tick % 3 && i < 3
        const kindColor = KIND_COLOR[it.kind] ?? 'var(--text-2)'
        const kindLabel = KIND_LABEL[it.kind]
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 10,
              padding: '8px 12px',
              borderLeft: `2px solid ${isNew ? 'var(--accent)' : 'transparent'}`,
              background: isNew ? 'var(--accent-dim)' : 'transparent',
              transition: 'background 200ms',
            }}
          >
            <AgentBadge agentId={it.agent} size={20} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}
                >
                  {a?.name ?? it.agent}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 9.5,
                    color: kindColor,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                  }}
                >
                  {kindLabel}
                </span>
                <span style={{ flex: 1 }} />
                <span
                  className="mono tabular"
                  style={{ fontSize: 10, color: 'var(--text-4)' }}
                >
                  {it.t}
                </span>
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--text-2)',
                  lineHeight: 1.4,
                  wordBreak: 'break-all',
                }}
              >
                {it.text}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Re-exports for convenience
export type { Team, TeamMember, ActivityItem, MemberState }
