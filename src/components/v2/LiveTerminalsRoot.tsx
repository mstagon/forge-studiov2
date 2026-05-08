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
  /** Subscribe to slot/host changes — used to force a re-render so portals reattach. */
  subscribe(listener: () => void): () => void
}

interface InternalRegistry extends LiveTerminalsRegistry {
  pruneHosts(activeKeys: ReadonlySet<string>): void
  reattachAll(): void
}

function createRegistry(): InternalRegistry {
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
      } else if (slots.has(key)) {
        slots.delete(key)
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
      {/* Hidden home for unparented hosts. Visibility hidden + zero-size
          keeps xterm WebGL/canvas alive without affecting layout. Hosts are
          reparented into LiveTerminalGrid CellSlot DOM elements when active. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          overflow: 'hidden',
          visibility: 'hidden',
          pointerEvents: 'none',
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
            />,
            host,
            key,
          )
        })}
      </div>
    </RegistryContext.Provider>
  )
}
