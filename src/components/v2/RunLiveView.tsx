// RunLiveView — TeamLiveView from teams.jsx.
// Members rail (left) + tmux split grid (center) + activity feed (right) + control bar.
//
// Note: this is the design "live view" — it visualizes a Run's parallel agents
// using mock terminal lines + a tick-driven activity feed. The real PTY wiring is
// a future integration; for now it consumes seed data via props.

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { AGENT_BY_ID, TERMINAL_LINES } from './data'
import type { Team, TeamMember, ActivityItem, MemberState, TerminalLine } from './types'
import { MergeConflictView, type ConflictItem } from './MergeConflictView'
import { LiveTerminalGrid } from './LiveTerminalGrid'
import { useLiveTerminalsStore } from '@/stores/liveTerminals'
import { InboxPanel } from './InboxPanel'
import {
  useTeamActivityStore,
  type ActivityEntry as RealActivityEntry,
} from '@/stores/teamActivity'

// ─── Optional team-control IPC (graceful when backend is unfinished) ─
//
// The pause / resume / merge / per-member control surface is being added by a
// peer worker. We type it loosely + reach in via optional chaining so the UI
// keeps compiling and degrades to a console.warn no-op when methods are
// missing in the renderer's preload bridge.
interface TeamsControlApi {
  pause?: (teamId: string) => Promise<void> | void
  resume?: (teamId: string) => Promise<void> | void
  pauseMember?: (teamId: string, agentName: string) => Promise<void> | void
  resumeMember?: (teamId: string, agentName: string) => Promise<void> | void
  merge?: (teamId: string) => Promise<
    | { ok: true; mergedBranch?: string; commitSha?: string | null }
    | { ok: false; conflicts: ConflictItem[]; error?: string }
  >
}

function getTeamsControlApi(): TeamsControlApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.teams as TeamsControlApi | undefined
}

export interface RunLiveViewProps {
  team: Team
  onClose: () => void
  density?: 'compact' | 'normal' | 'spacious'
  /**
   * Optional override of the activity feed. When omitted, the feed pulls
   * real entries from the `teamActivity` zustand store (driven by main's
   * TeamActivityTracker) and falls back to an empty-state placeholder if
   * nothing has been observed yet.
   */
  activity?: ActivityItem[]
  /** Optional override of pane terminal lines by agentId; defaults to seed `TERMINAL_LINES`. */
  terminalLines?: Record<string, TerminalLine[]>
}

export function RunLiveView({
  team,
  onClose,
  activity,
  terminalLines = TERMINAL_LINES,
}: RunLiveViewProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [feedOpen, setFeedOpen] = useState(true)
  const [inboxAgent, setInboxAgent] = useState<string | null>(null)
  // Local paused fallback for the design demo (when no real backend status).
  const [localPaused, setLocalPaused] = useState(false)
  const paused = team.status === 'paused' || localPaused

  // Push the active team into LiveTerminalsRoot so XTerminal mounts survive
  // navigation away from this view. Same teamId reuses existing hosts; a
  // different teamId tears down the previous team's PTYs.
  const setActiveTeam = useLiveTerminalsStore((s) => s.setActiveTeam)
  useEffect(() => {
    setActiveTeam({
      teamId: team.id,
      members: team.members.map((m) => ({
        agentId: m.agentId,
        name: m.name,
        tmuxPaneId: m.tmuxPaneId,
        state: m.state,
      })),
    })
  }, [team.id, team.members, setActiveTeam])

  // Transient inline notice (success / warn) for IPC-triggered actions.
  const [notice, setNotice] = useState<{
    kind: 'info' | 'warn' | 'error' | 'success'
    text: string
  } | null>(null)
  function flash(kind: 'info' | 'warn' | 'error' | 'success', text: string) {
    setNotice({ kind, text })
    window.setTimeout(() => setNotice(null), 3500)
  }

  // Merge-conflict overlay state — shown when teams.merge resolves to ok=false.
  const [activeConflict, setActiveConflict] = useState<{
    teamId: string
    conflicts: ConflictItem[]
  } | null>(null)

  // Live tick — drives terminal scroll + activity feed
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setTick((t) => t + 1), 1200)
    return () => clearInterval(id)
  }, [paused])

  // ── Real activity feed (TeamActivityTracker → store) ──────────────
  //
  // When the caller doesn't override `activity` we subscribe to live events
  // for this team. The store ref-counts subscribers + tears down the IPC
  // listener when the last consumer unmounts.
  const subscribeActivity = useTeamActivityStore((s) => s.subscribe)
  const unsubscribeActivity = useTeamActivityStore((s) => s.unsubscribe)
  const teamEntries = useTeamActivityStore((s) => s.entries[team.id])
  useEffect(() => {
    if (activity) return // override active — don't double-fetch
    let cancelled = false
    subscribeActivity(team.id).catch(() => {
      // hydrate failure is non-fatal — live stream still works
    })
    return () => {
      cancelled = true
      // Defer unsubscribe so back-to-back remounts don't thrash IPC. Effect
      // cleanup runs synchronously, microtask is enough.
      Promise.resolve().then(() => {
        if (cancelled) unsubscribeActivity(team.id)
      })
    }
  }, [team.id, activity, subscribeActivity, unsubscribeActivity])

  /**
   * Render-time mapping from the persistence shape to the v2 `ActivityItem`
   * the feed renderer already understands. We always return a stable list:
   *   - explicit `activity` prop wins (used by the design demo)
   *   - else live store entries, mapped via realToActivityItem
   *   - else an empty array → empty-state placeholder in <ActivityFeed/>
   */
  const feedItems = useMemo<ActivityItem[]>(() => {
    if (activity) return activity
    if (!teamEntries || teamEntries.length === 0) return []
    return teamEntries.map(realToActivityItem)
  }, [activity, teamEntries])

  // ── Action handlers (all IPC-optional) ──────────────────────────
  async function handlePauseAll() {
    const api = getTeamsControlApi()
    if (paused) {
      if (typeof api?.resume === 'function') {
        try {
          await api.resume(team.id)
          flash('success', `Resumed ${team.name}`)
        } catch (err) {
          console.error('[RunLiveView] resume failed:', err)
          flash('error', 'Resume failed — see console')
        }
      } else {
        console.warn('[RunLiveView] window.api.teams.resume() not implemented')
        setLocalPaused(false)
      }
    } else {
      if (typeof api?.pause === 'function') {
        try {
          await api.pause(team.id)
          flash('success', `Paused ${team.name}`)
        } catch (err) {
          console.error('[RunLiveView] pause failed:', err)
          flash('error', 'Pause failed — see console')
        }
      } else {
        console.warn('[RunLiveView] window.api.teams.pause() not implemented')
        setLocalPaused(true)
      }
    }
  }

  async function handlePauseMember(member: TeamMember) {
    const api = getTeamsControlApi()
    const agentName = member.name ?? member.agentId
    const isPaused = member.state === 'paused'
    const fn = isPaused ? api?.resumeMember : api?.pauseMember
    const verb = isPaused ? 'Resume' : 'Pause'
    if (typeof fn !== 'function') {
      console.warn(`[RunLiveView] window.api.teams.${verb.toLowerCase()}Member() not implemented`)
      flash('warn', `${verb} member — backend not yet wired`)
      return
    }
    try {
      await fn(team.id, agentName)
      flash('success', `${verb}d ${agentName}`)
    } catch (err) {
      console.error(`[RunLiveView] ${verb.toLowerCase()}Member failed:`, err)
      flash('error', `${verb} failed — see console`)
    }
  }

  function handleDiff() {
    // No backend conflict source yet — surface a benign inline notice.
    flash('info', 'No merge conflicts')
  }

  async function handleMerge() {
    const ok = window.confirm(
      `Merge all completed members of "${team.name}" into ${team.branch}?`,
    )
    if (!ok) return
    const api = getTeamsControlApi()
    if (typeof api?.merge !== 'function') {
      console.warn('[RunLiveView] window.api.teams.merge() not implemented')
      flash('warn', 'Merge — backend not yet wired')
      return
    }
    try {
      const res = await api.merge(team.id)
      if (res.ok) {
        flash('success', `Merged into ${res.mergedBranch ?? team.branch}`)
      } else {
        const conflicts = Array.isArray(res.conflicts) ? res.conflicts : []
        if (conflicts.length === 0) {
          flash('error', res.error ?? 'Merge failed (no conflict detail)')
        } else {
          setActiveConflict({ teamId: team.id, conflicts })
        }
      }
    } catch (err) {
      console.error('[RunLiveView] merge failed:', err)
      flash('error', 'Merge failed — see console')
    }
  }

  function handleOpenAgentTerminal(member: TeamMember) {
    if (!member.tmuxPaneId) {
      flash(
        'warn',
        'tmux 세션이 아직 spawn 되지 않음 — 워크스페이스 isolated 옵션으로 다시 생성 필요',
      )
      return
    }
    // The LiveTerminalGrid already owns the live PTY attach for every
    // member. Spawning another via openAgentTerminal() would leak a
    // detached PTY that nothing reads from. Instead, ask the grid to
    // fullscreen this agent's existing pane.
    const agentName = member.name ?? member.agentId
    setSelectedAgentId(member.agentId)
    window.dispatchEvent(
      new CustomEvent('forge:agent-fullscreen', {
        detail: { agentId: member.agentId, agentName },
      }),
    )
  }

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
          onClick={handlePauseAll}
        >
          {paused ? 'Resume all' : 'Pause all'}
        </Btn>
        <Btn variant="ghost" icon={<Icon.Diff size={12} />} onClick={handleDiff}>
          Diff
        </Btn>
        <Btn variant="primary" icon={<Icon.Check size={12} />} onClick={handleMerge}>
          Merge
        </Btn>
        <Btn variant="ghost" icon={<Icon.X size={12} />} onClick={onClose}>
          Close team
        </Btn>
      </div>

      {/* Inline notice (transient, replaces toast for in-view IPC actions) */}
      {notice && <InlineNotice kind={notice.kind} text={notice.text} />}

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
                onTogglePause={() => handlePauseMember(m)}
                onOpenTerminal={() => handleOpenAgentTerminal(m)}
                onOpenInbox={() => setInboxAgent(m.name ?? m.agentId)}
                unreadCount={m.unreadCount ?? 0}
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
          <LiveTerminalGrid
            members={team.members}
            teamId={team.id}
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
            <ActivityFeed tick={tick} paused={paused} items={feedItems} />
          </div>
        )}
      </div>

      {/* Merge conflict overlay — only when teams.merge() returned ok=false */}
      {activeConflict && (
        <MergeConflictView
          teamId={activeConflict.teamId}
          conflicts={activeConflict.conflicts}
          onResolve={(file, strategy) => {
            console.warn(
              `[RunLiveView] resolve(${file}, ${strategy}) — backend resolver not yet wired`,
            )
            flash('info', `Resolve ${strategy} → ${file}`)
            // Optimistic UI: drop the resolved file from the list. Backend
            // will republish via teams:update once it actually resolves.
            setActiveConflict((cur) =>
              cur
                ? {
                    ...cur,
                    conflicts: cur.conflicts.filter((c) => c.file !== file),
                  }
                : cur,
            )
          }}
          onAbort={() => {
            setActiveConflict(null)
            flash('warn', 'Merge aborted')
          }}
          onClose={() => setActiveConflict(null)}
        />
      )}
      {inboxAgent && (
        <InboxPanel
          teamId={team.id}
          agentName={inboxAgent}
          otherMembers={team.members.map((m) => ({ agentId: m.agentId, name: m.name }))}
          onClose={() => setInboxAgent(null)}
        />
      )}
    </div>
  )
}

// ─── Inline notice (transient, replaces Shell-level toast in live view) ──

function InlineNotice({
  kind,
  text,
}: {
  kind: 'info' | 'warn' | 'error' | 'success'
  text: string
}) {
  const palette: Record<typeof kind, { bg: string; border: string; fg: string }> = {
    info: {
      bg: 'color-mix(in oklab, var(--info, var(--accent)) 12%, var(--bg-2))',
      border: 'color-mix(in oklab, var(--info, var(--accent)) 35%, var(--line-2))',
      fg: 'var(--info, var(--accent))',
    },
    warn: {
      bg: 'color-mix(in oklab, var(--warning, #f0a23a) 12%, var(--bg-2))',
      border: 'color-mix(in oklab, var(--warning, #f0a23a) 35%, var(--line-2))',
      fg: 'var(--warning, #f0a23a)',
    },
    error: {
      bg: 'color-mix(in oklab, var(--danger) 12%, var(--bg-2))',
      border: 'color-mix(in oklab, var(--danger) 35%, var(--line-2))',
      fg: 'var(--danger)',
    },
    success: {
      bg: 'color-mix(in oklab, var(--success) 12%, var(--bg-2))',
      border: 'color-mix(in oklab, var(--success) 35%, var(--line-2))',
      fg: 'var(--success)',
    },
  }
  const p = palette[kind]
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 56,
        right: 18,
        zIndex: 60,
        padding: '8px 12px',
        borderRadius: 6,
        background: p.bg,
        border: `1px solid ${p.border}`,
        color: p.fg,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: 'var(--font-mono)',
        boxShadow: 'var(--shadow-pop, 0 4px 12px rgba(0,0,0,0.25))',
        maxWidth: 360,
      }}
    >
      {text}
    </div>
  )
}

// ─── Agent card (members rail) ──────────────────────────────────────

interface AgentCardProps {
  member: TeamMember
  selected: boolean
  onClick: () => void
  /** ▶/⏸ toggle (active/done → pause; idle/queued → resume; blocked → disabled). */
  onTogglePause?: () => void
  /** Open the agent's tmux pane in a new terminal tab. */
  onOpenTerminal?: () => void
  /** Open the inbox panel for this member (member ↔ member messages). */
  onOpenInbox?: () => void
  /** Unread message count for the inbox icon badge. */
  unreadCount?: number
}

function AgentCard({
  member,
  selected,
  onClick,
  onTogglePause,
  onOpenTerminal,
  onOpenInbox,
  unreadCount = 0,
}: AgentCardProps) {
  const a = AGENT_BY_ID[member.agentId]
  const stateC = STATE_COLOR[member.state]
  if (!a) return null
  const blocked = member.state === 'blocked'
  const isPaused = member.state === 'paused'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
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
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 2 }}
        >
          {onTogglePause && (
            <CardIconBtn
              title={
                blocked
                  ? '결정 대기 — 외부 응답 필요'
                  : isPaused
                    ? `Resume ${a.name}`
                    : `Pause ${a.name}`
              }
              disabled={blocked}
              onClick={(e) => {
                e.stopPropagation()
                if (!blocked) onTogglePause()
              }}
              danger={blocked}
            >
              {blocked ? (
                <span style={{ fontSize: 11, lineHeight: 1 }}>⚠</span>
              ) : isPaused ? (
                <Icon.Play size={11} />
              ) : (
                <Icon.Pause size={11} />
              )}
            </CardIconBtn>
          )}
          {onOpenTerminal && (
            <CardIconBtn
              title={
                member.tmuxPaneId
                  ? `Open ${a.name} terminal`
                  : 'tmux 세션 미할당 — isolated 옵션으로 재생성 필요'
              }
              onClick={(e) => {
                e.stopPropagation()
                onOpenTerminal()
              }}
              dim={!member.tmuxPaneId}
            >
              <Icon.Terminal size={11} />
            </CardIconBtn>
          )}
          {onOpenInbox && (
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <CardIconBtn
                title={`${a.name} inbox · 팀원 메시지`}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenInbox()
                }}
              >
                <Icon.Mail size={11} />
              </CardIconBtn>
              {unreadCount > 0 && (
                <span
                  aria-label={`${unreadCount} unread`}
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 14,
                    height: 14,
                    padding: '0 4px',
                    background: 'var(--danger)',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 700,
                    borderRadius: 7,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
          )}
        </div>
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
    </div>
  )
}

// ─── Tiny icon-only button used inside AgentCard ────────────────────
//
// Stops click propagation by default so it doesn't toggle the card's selection
// when the user just wanted to pause / open terminal.
interface CardIconBtnProps {
  children: React.ReactNode
  title?: string
  disabled?: boolean
  danger?: boolean
  dim?: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}

function CardIconBtn({ children, title, disabled, danger, dim, onClick }: CardIconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        width: 18,
        height: 18,
        borderRadius: 3,
        background: 'transparent',
        border: '1px solid transparent',
        color: danger
          ? 'var(--danger)'
          : dim
            ? 'var(--text-4, var(--text-3))'
            : 'var(--text-3)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-4, var(--bg-3))'
        ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
        ;(e.currentTarget as HTMLButtonElement).style.color = danger
          ? 'var(--danger)'
          : dim
            ? 'var(--text-4, var(--text-3))'
            : 'var(--text-3)'
      }}
    >
      {children}
    </button>
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
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Auto-scroll-to-top when a new entry is prepended. We compare lengths +
  // the head item identity (text+timestamp) to avoid scrolling on every
  // re-render unrelated to insertion.
  const prevHeadKeyRef = useRef<string>('')
  useEffect(() => {
    if (!items.length) return
    const head = items[0]
    const key = `${head.t}:${head.text}:${items.length}`
    if (key !== prevHeadKeyRef.current) {
      prevHeadKeyRef.current = key
      const el = scrollRef.current
      if (el) {
        // requestAnimationFrame so the DOM has the new node before we move.
        requestAnimationFrame(() => {
          el.scrollTop = 0
        })
      }
    }
  }, [items])

  if (items.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 16px',
          textAlign: 'center',
          color: 'var(--text-4)',
          fontSize: 11.5,
          lineHeight: 1.5,
        }}
      >
        활동 없음 — 첫 변경을 기다리는 중
      </div>
    )
  }
  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
      {items.map((it, i) => {
        const a = AGENT_BY_ID[it.agent]
        const isNew = !paused && i === tick % 3 && i < 3
        const kindColor = KIND_COLOR[it.kind] ?? 'var(--text-2)'
        const kindLabel = KIND_LABEL[it.kind]
        return (
          <div
            key={`${it.t}-${i}`}
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

// ─── Real activity → ActivityItem mapping ───────────────────────────
//
// TeamActivityTracker emits structured records; the v2 ActivityItem feed
// expects { t, agent, kind, text }. We collapse the structured fields into
// a one-line `text` per kind:
//   edit   → "<file> +A -R"
//   commit → "<sha> <subject> · N files"
//   state  → "state: <from> → <to>"
//
// Kind is mapped onto the existing palette (edit/commit/decision/queued/done)
// — state-change becomes 'decision' so it picks up the accent colour.

function realToActivityItem(e: RealActivityEntry): ActivityItem {
  const time = formatHHMMSS(e.ts)
  if (e.kind === 'edit') {
    const parts: string[] = [e.file ?? '(unknown)']
    if (typeof e.added === 'number' || typeof e.removed === 'number') {
      const a = typeof e.added === 'number' ? `+${e.added}` : ''
      const r = typeof e.removed === 'number' ? `-${e.removed}` : ''
      parts.push([a, r].filter(Boolean).join(' '))
    }
    return { t: time, agent: e.agent, kind: 'edit', text: parts.join(' ') }
  }
  if (e.kind === 'commit') {
    const fileCount = e.files?.length ?? 0
    const fileSuffix = fileCount > 0 ? ` · ${fileCount} files` : ''
    const subj = e.message?.trim() || '(no message)'
    const sha = e.sha ? `${e.sha} ` : ''
    return {
      t: time,
      agent: e.agent,
      kind: 'commit',
      text: `${sha}${subj}${fileSuffix}`,
    }
  }
  // state-change
  return {
    t: time,
    agent: e.agent,
    kind: 'decision',
    text: `state: ${e.from ?? '?'} → ${e.to ?? '?'}`,
  }
}

function formatHHMMSS(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// Re-exports for convenience
export type { Team, TeamMember, ActivityItem, MemberState }
