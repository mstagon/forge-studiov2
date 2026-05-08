// LiveTerminalGrid — real PTY-backed grid for RunLiveView.
//
// Each grid cell mounts (via portal) an `<XTerminal agent={...}>` instance bound
// to the member's tmux pane. The xterm instance lives in a stable host element
// keyed by `agentName`, so it survives layout transitions:
//   normal grid (Nx M)  ↔  focus mode (1 expanded + thumbnails)  ↔  fullscreen
// Without this portal pattern each layout reshape would tear down + respawn the
// PTY (reattaching to tmux every time, losing scrollback, etc.).
//
// Fallback path: members without `tmuxPaneId` (shared worktree, tmux missing)
// or in `queued` state render the design's "fake terminal lines" cycling — same
// look the live view shipped with before real PTY landed.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import { AgentBadge, Dot, STATE_COLOR, STATE_LABEL } from './primitives'
import { AGENT_BY_ID } from './data'
import { XTerminal } from './XTerminal'
import type { TeamMember, TerminalLine } from './types'

// ─── Slot registry (stable host per agentName) ─────────────────────

type ElMap = Map<string, HTMLDivElement>

interface SlotRegistry {
  setSlot(key: string, el: HTMLDivElement | null): void
  getOrCreateHost(key: string): HTMLDivElement
  pruneHosts(activeKeys: ReadonlySet<string>): void
  reattachAll(): void
  subscribe(listener: () => void): () => void
}

function createSlotRegistry(): SlotRegistry {
  const slots: ElMap = new Map()
  const hosts: ElMap = new Map()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  const reattach = (key: string) => {
    const slot = slots.get(key)
    const host = hosts.get(key)
    if (!slot || !host) return
    if (host.parentElement !== slot) slot.appendChild(host)
  }

  return {
    setSlot(key, el) {
      if (el) {
        slots.set(key, el)
        reattach(key)
        notify()
      } else if (slots.has(key)) {
        slots.delete(key)
        notify()
      }
    },
    getOrCreateHost(key) {
      let host = hosts.get(key)
      if (!host) {
        host = document.createElement('div')
        host.style.height = '100%'
        host.style.width = '100%'
        hosts.set(key, host)
      }
      return host
    },
    pruneHosts(activeKeys) {
      for (const k of Array.from(hosts.keys())) {
        if (!activeKeys.has(k)) {
          hosts.get(k)?.remove()
          hosts.delete(k)
        }
      }
    },
    reattachAll() {
      for (const k of slots.keys()) reattach(k)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

// ─── Cell slot (adopts the persistent host element) ────────────────

interface CellSlotProps {
  agentKey: string
  registry: SlotRegistry
}

function CellSlot({ agentKey, registry }: CellSlotProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    registry.setSlot(agentKey, ref.current)
    return () => registry.setSlot(agentKey, null)
  }, [agentKey, registry])
  return (
    <div
      ref={ref}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
      }}
    />
  )
}

// ─── Pane shell (header + body container) ──────────────────────────

interface PaneShellProps {
  member: TeamMember
  size: 'compact' | 'normal' | 'expanded'
  onClick?: () => void
  onClose?: () => void
  onToggleFullscreen?: () => void
  fullscreen?: boolean
  children: React.ReactNode
}

function PaneShell({
  member,
  size,
  onClick,
  onClose,
  onToggleFullscreen,
  fullscreen,
  children,
}: PaneShellProps) {
  const a = AGENT_BY_ID[member.agentId]
  const stateC = STATE_COLOR[member.state]
  const isActive = member.state === 'active'

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!onToggleFullscreen) return
    e.stopPropagation()
    onToggleFullscreen()
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
      style={{
        height: '100%',
        width: '100%',
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
        {onToggleFullscreen && size !== 'compact' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFullscreen()
            }}
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (double-click)'}
            style={{
              width: 18,
              height: 18,
              marginLeft: 2,
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
            <Icon.Layers size={11} />
          </button>
        )}
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            title="Exit focus (Esc)"
            style={{
              width: 18,
              height: 18,
              marginLeft: 2,
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
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
        {children}
      </div>
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
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          ⚠ 결정 대기
        </div>
      )}
    </div>
  )
}

// ─── Fallback fake-terminal body (no PTY available / queued) ───────

interface FakeBodyProps {
  member: TeamMember
  tick: number
  size: 'compact' | 'normal' | 'expanded'
  lines: TerminalLine[]
  reason?: string
}

function FakeBody({ member, tick, size, lines, reason }: FakeBodyProps) {
  const compact = size === 'compact'
  const expanded = size === 'expanded'
  const visibleCount = compact ? 4 : expanded ? 18 : 9
  const offset = member.state === 'active' ? tick : 0
  const slice: TerminalLine[] = []
  for (let i = 0; i < visibleCount; i++) {
    const idx = (offset + i) % lines.length
    slice.push(lines[idx])
  }
  const isActive = member.state === 'active'
  return (
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
        position: 'relative',
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
      {reason && (
        <div
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 6,
            padding: '4px 8px',
            background: 'color-mix(in oklab, var(--bg-3) 80%, transparent)',
            border: '1px solid var(--line-2)',
            borderRadius: 4,
            fontSize: 10,
            color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {reason}
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────

export interface LiveTerminalGridProps {
  members: TeamMember[]
  teamId: string
  tick: number
  selectedAgentId: string | null
  onSelect: (id: string | null) => void
  /** Fallback fake terminal lines keyed by agentId (used when tmuxPaneId is unset). */
  terminalLines: Record<string, TerminalLine[]>
}

export function LiveTerminalGrid({
  members,
  teamId,
  tick,
  selectedAgentId,
  onSelect,
  terminalLines,
}: LiveTerminalGridProps) {
  // Stable registry across re-renders.
  const registryRef = useRef<SlotRegistry | null>(null)
  if (!registryRef.current) registryRef.current = createSlotRegistry()
  const registry = registryRef.current

  // Force re-render when slots change so portals reattach.
  const [, force] = useState(0)
  useEffect(() => registry.subscribe(() => force((n) => n + 1)), [registry])

  // Fullscreen state — agentId, when set, takes over the entire grid.
  const [fullscreenAgentId, setFullscreenAgentId] = useState<string | null>(null)

  // ESC closes fullscreen (then focus mode, handled by parent via selectedAgentId).
  useEffect(() => {
    if (!fullscreenAgentId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setFullscreenAgentId(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [fullscreenAgentId])

  // Members eligible for real PTY (have tmuxPaneId AND not in queued state).
  const liveAgentKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const m of members) {
      if (m.tmuxPaneId && m.state !== 'queued') {
        keys.add(m.name ?? m.agentId)
      }
    }
    return keys
  }, [members])

  // Prune hosts for agents that vanish (member removed) or lose tmuxPaneId.
  useEffect(() => {
    registry.pruneHosts(liveAgentKeys)
    registry.reattachAll()
  })

  const layout = useMemo(() => {
    const n = members.length
    if (n <= 1) return { cols: 1, rows: 1 }
    if (n === 2) return { cols: 2, rows: 1 }
    if (n === 3) return { cols: 3, rows: 1 }
    if (n === 4) return { cols: 2, rows: 2 }
    if (n <= 6) return { cols: 3, rows: 2 }
    return { cols: 4, rows: Math.ceil(n / 4) }
  }, [members.length])

  const renderBody = (member: TeamMember, size: 'compact' | 'normal' | 'expanded') => {
    const agentKey = member.name ?? member.agentId
    if (member.tmuxPaneId && member.state !== 'queued') {
      return <CellSlot agentKey={agentKey} registry={registry} />
    }
    const reason = !member.tmuxPaneId
      ? 'Terminal unavailable — shared worktree or tmux missing'
      : member.state === 'queued'
        ? 'Waiting…'
        : undefined
    const lines = terminalLines[member.agentId] ?? [
      { c: 'var(--text-3)', t: '$ # waiting…' },
      { c: 'var(--text-3)', t: '$ _' },
    ]
    return (
      <FakeBody
        member={member}
        tick={tick}
        size={size}
        lines={lines}
        reason={reason}
      />
    )
  }

  // ── Layout render ────────────────────────────────────────────────

  let layoutNode: React.ReactNode

  if (fullscreenAgentId) {
    const fs = members.find((m) => m.agentId === fullscreenAgentId)
    if (!fs) {
      // Member vanished while fullscreen — drop back to grid.
      setTimeout(() => setFullscreenAgentId(null), 0)
    }
    layoutNode = fs ? (
      <div style={{ flex: 1, minHeight: 0, padding: 8 }}>
        <PaneShell
          member={fs}
          size="expanded"
          fullscreen
          onToggleFullscreen={() => setFullscreenAgentId(null)}
        >
          {renderBody(fs, 'expanded')}
        </PaneShell>
      </div>
    ) : null
  } else if (selectedAgentId) {
    const focused = members.find((m) => m.agentId === selectedAgentId)
    const others = members.filter((m) => m.agentId !== selectedAgentId)
    layoutNode = focused ? (
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
          <PaneShell
            member={focused}
            size="expanded"
            onClose={() => onSelect(null)}
            onToggleFullscreen={() => setFullscreenAgentId(focused.agentId)}
          >
            {renderBody(focused, 'expanded')}
          </PaneShell>
        </div>
        <div style={{ display: 'flex', gap: 8, height: 110, flexShrink: 0 }}>
          {others.map((m) => (
            <div key={m.agentId} style={{ flex: 1, minWidth: 0 }}>
              <PaneShell
                member={m}
                size="compact"
                onClick={() => onSelect(m.agentId)}
              >
                {renderBody(m, 'compact')}
              </PaneShell>
            </div>
          ))}
        </div>
      </div>
    ) : null
  } else {
    layoutNode = (
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
          <PaneShell
            key={m.agentId}
            member={m}
            size="normal"
            onClick={() => onSelect(m.agentId)}
            onToggleFullscreen={() => setFullscreenAgentId(m.agentId)}
          >
            {renderBody(m, 'normal')}
          </PaneShell>
        ))}
      </div>
    )
  }

  // ── Persistent xterm portals (one per live agent) ────────────────
  // Rendered alongside the layout so each XTerminal component retains its
  // mount across grid → focus → fullscreen transitions. The host is the
  // adoption target; its current parent is whichever CellSlot last claimed it.
  const portals = members
    .filter((m) => m.tmuxPaneId && m.state !== 'queued')
    .map((m) => {
      const agentKey = m.name ?? m.agentId
      const host = registry.getOrCreateHost(agentKey)
      return createPortal(
        <XTerminal
          tabId={`team-${teamId}`}
          paneId={`agent-${agentKey}`}
          cwd=""
          isActive
          agent={{ teamId, agentName: agentKey }}
        />,
        host,
        agentKey,
      )
    })

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {layoutNode}
      {portals}
    </div>
  )
}
