// LiveTerminalsRoot — App-level mount point for every team member's <XTerminal>.
//
// LiveTerminalGrid used to own both the SlotRegistry AND the XTerminal mounts.
// That meant unmounting the grid (e.g. user navigates Library → Run) tore down
// every PTY: tmux-attach killed, scrollback gone, and a fresh attach fired off
// when the user returned. From the user's perspective: "터미널이 날아간다."
//
// Lifting the registry + the actual <XTerminal> instances up to App keeps every
// active member's terminal alive for the lifetime of the team session. The grid
// becomes a pure layout/slot host: each cell registers an HTMLElement via
// `useTerminalsRegistry()`, and the registry adopts the persistent host element
// (which holds the live xterm) into that slot via DOM appendChild.
//
// Lifecycle contract
//   • RunLiveView calls `useLiveTerminalsStore.setActiveTeam({ teamId, members })`
//     on mount and whenever `team.members` changes. Same teamId reuses hosts
//     (no PTY churn). Different teamId tears down the previous team's hosts.
//   • Workspace swap calls `clear()` so we don't keep stale terminals alive
//     when the user is no longer in the originating workspace.
//   • LiveTerminalGrid's CellSlot calls `register(key, slotEl)` on mount and
//     `register(key, null)` on unmount. The registry only keeps host DOM nodes
//     for keys present in the active team's members.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useLiveTerminalsStore, type LiveMemberRef } from '@/stores/liveTerminals'
import { XTerminal } from './XTerminal'

// ─── Registry primitive (DOM-level reparenting) ──────────────────────

type ElMap = Map<string, HTMLDivElement>

export interface LiveTerminalsRegistry {
  /** Register or unregister a slot DOM element for an agent key. */
  setSlot(key: string, el: HTMLDivElement | null): void
  /** Get (or lazily create) the persistent host element for an agent key. */
  getOrCreateHost(key: string): HTMLDivElement
  /** Record the PTY id that the XTerminal at `key` is currently attached to.
   *  Owned by the registry so that pruneHosts() can dispose it cleanly when
   *  the corresponding member is no longer active. XTerminal must NOT call
   *  pty.dispose() in its own effect cleanup (see comment there). */
  setHostPtyId(key: string, ptyId: string | null): void
  /** Subscribe to slot/host changes — used to force a re-render so portals reattach. */
  subscribe(listener: () => void): () => void
}

interface InternalRegistry extends LiveTerminalsRegistry {
  pruneHosts(activeKeys: ReadonlySet<string>): void
  reattachAll(): void
  setHomeElement(el: HTMLDivElement | null): void
  disposeAllPtys(): void
}

function createRegistry(): InternalRegistry {
  const slots: ElMap = new Map()
  // host key → most recently reported PTY id, captured via XTerminal's
  // onPtyCreated callback. We dispose this when the host is pruned — it's
  // the ONLY place a PTY should be torn down for an agent terminal. See
  // XTerminal cleanup comment for why component unmount can NOT own dispose.
  const hostPtyIds: Map<string, string> = new Map()
  const hosts: ElMap = new Map()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  /**
   * Persistent off-screen home for hosts that aren't currently adopted by a
   * grid cell. Set by LiveTerminalsRoot via the hidden div ref. Hosts MUST
   * land here on cell unmount — otherwise the React-managed grid cell DOM
   * carries the host (and its xterm children) down with it on tear-down,
   * which is the exact "터미널이 초기화" symptom users hit when navigating
   * away from RunLiveView and back.
   */
  let homeElement: HTMLDivElement | null = null

  const reattach = (key: string) => {
    const slot = slots.get(key)
    const host = hosts.get(key)
    if (!slot || !host) return
    if (host.parentElement !== slot) slot.appendChild(host)
  }

  const sendHome = (key: string) => {
    const host = hosts.get(key)
    if (!host) return
    if (homeElement && host.parentElement !== homeElement) {
      homeElement.appendChild(host)
    }
  }

  return {
    setSlot(key, el) {
      if (el) {
        slots.set(key, el)
        reattach(key)
      } else if (slots.has(key)) {
        slots.delete(key)
        // CRITICAL: park the host back at home before the cell DOM is torn
        // down. Without this, the host follows the unmounting grid cell into
        // detachment, the xterm renderer goes with it, and the next mount
        // sees an empty container — exactly the regression we're fixing.
        sendHome(key)
      }
      notify()
    },
    getOrCreateHost(key) {
      let host = hosts.get(key)
      if (!host) {
        host = document.createElement('div')
        host.style.height = '100%'
        host.style.width = '100%'
        hosts.set(key, host)
        // New hosts also start at home so the React portal has a valid
        // parent to render into before any slot adopts them.
        if (homeElement) homeElement.appendChild(host)
      }
      return host
    },
    pruneHosts(activeKeys) {
      for (const k of Array.from(hosts.keys())) {
        if (!activeKeys.has(k)) {
          // Dispose the PTY first — once we drop the host, no one will
          // reattach to it, so the underlying tmux session must be torn down
          // here rather than leaked. This is also the ONLY place we dispose
          // an agent PTY (XTerminal cleanup intentionally skips dispose).
          const ptyId = hostPtyIds.get(k)
          if (ptyId) {
            window.api?.pty?.dispose?.(ptyId)
            hostPtyIds.delete(k)
          }
          hosts.get(k)?.remove()
          hosts.delete(k)
        }
      }
    },
    disposeAllPtys() {
      for (const [k, ptyId] of hostPtyIds) {
        window.api?.pty?.dispose?.(ptyId)
        hostPtyIds.delete(k)
      }
    },
    setHostPtyId(key, ptyId) {
      if (ptyId == null) {
        hostPtyIds.delete(key)
      } else {
        hostPtyIds.set(key, ptyId)
      }
    },
    reattachAll() {
      for (const k of slots.keys()) reattach(k)
    },
    setHomeElement(el) {
      homeElement = el
      // When the home becomes available (first mount), pull every orphan
      // host that isn't currently in a slot back to the home node.
      if (el) {
        for (const [k, host] of hosts) {
          if (!slots.has(k)) {
            if (host.parentElement !== el) el.appendChild(host)
          }
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

// ─── Context wiring ──────────────────────────────────────────────────

const RegistryContext = createContext<LiveTerminalsRegistry | null>(null)

export function useTerminalsRegistry(): LiveTerminalsRegistry {
  const reg = useContext(RegistryContext)
  if (!reg) {
    throw new Error('useTerminalsRegistry must be used inside <LiveTerminalsRoot>')
  }
  return reg
}

// ─── Root component ──────────────────────────────────────────────────

interface LiveTerminalsRootProps {
  children: ReactNode
}

/**
 * Mount this once at the App root, around the rest of the v2 chrome.
 * It owns:
 *   1. A persistent registry (lives across all navigation inside this Root)
 *   2. A hidden div that hosts every active member's <XTerminal>
 *   3. createPortal targets — the host elements are reparented into grid
 *      slots when LiveTerminalGrid mounts, then released back to the hidden
 *      home when the slot unmounts.
 */
export function LiveTerminalsRoot({ children }: LiveTerminalsRootProps) {
  const registryRef = useRef<InternalRegistry | null>(null)
  if (!registryRef.current) registryRef.current = createRegistry()
  const registry = registryRef.current

  // Hidden home div ref — registry parks unattached hosts here so they
  // don't ride a destroyed grid cell DOM into oblivion.
  const homeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    registry.setHomeElement(homeRef.current)
    return () => registry.setHomeElement(null)
  }, [registry])

  // Force re-render when slots change so portals re-mount their host parents
  // (no actual remount happens — just the bookkeeping that triggers reattach).
  const [, force] = useState(0)
  useEffect(() => registry.subscribe(() => force((n) => n + 1)), [registry])

  const active = useLiveTerminalsStore((s) => s.active)

  // Live keys — only these get a mounted XTerminal portal. Members without a
  // tmuxPaneId or in 'queued' state fall back to the grid's FakeBody renderer.
  const liveMembers = useMemo<LiveMemberRef[]>(() => {
    if (!active) return []
    return active.members.filter((m) => m.tmuxPaneId && m.state !== 'queued')
  }, [active])

  const liveKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const m of liveMembers) keys.add(m.name ?? m.agentId)
    return keys
  }, [liveMembers])

  // Drop hosts for members no longer present (team change, member removed),
  // and reattach surviving hosts whenever the slot map changes.
  useEffect(() => {
    registry.pruneHosts(liveKeys)
    registry.reattachAll()
  }, [liveKeys, registry])

  const teamId = active?.teamId ?? ''

  return (
    <RegistryContext.Provider value={registry}>
      {children}
      {/* Hidden home for unparented hosts. Off-screen but with real size so
          xterm.js + fitAddon don't compute cols/rows = 0 while parked here.
          Hosts are reparented into LiveTerminalGrid CellSlot DOM when active,
          then sent back here on cell unmount (so a tear-down grid doesn't
          drag the host into detachment). */}
      <div
        ref={homeRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '-99999px',
          left: '-99999px',
          width: 800,
          height: 600,
          overflow: 'hidden',
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        {liveMembers.map((m) => {
          const key = m.name ?? m.agentId
          const host = registry.getOrCreateHost(key)
          return createPortal(
            <XTerminal
              tabId={`team-${teamId}`}
              paneId={`agent-${key}`}
              cwd=""
              isActive
              agent={{ teamId, agentName: key }}
              onPtyCreated={(ptyId) => registry.setHostPtyId(key, ptyId)}
            />,
            host,
            key,
          )
        })}
      </div>
    </RegistryContext.Provider>
  )
}
