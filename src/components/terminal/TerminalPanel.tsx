import { Fragment, useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTerminalStore } from '@/stores/terminal'
import { useWorkspaceStore } from '@/stores/workspace'
import { TerminalTabs } from './TerminalTabs'
import { XTerminal } from './XTerminal'
import type { TerminalPane, TerminalTab } from '@/types'

/**
 * Slot registry + persistent DOM hosts — preserve PTYs across split/re-parent.
 *
 * Why this exists: when a user splits a pane, the layout tree restructures so
 * the formerly top-level leaf is now a child of a new branch node. React
 * reconciles parents top-down and *cannot* preserve a component's DOM/state
 * across re-parenting, so the original `<XTerminal>` would unmount — disposing
 * the PTY along with it (history, running processes, etc.).
 *
 * Solution: for each leaf paneId we keep a long-lived "host" `<div>` that is
 * created once and survives every layout shuffle. The XTerminal is portaled
 * into that host (whose React parent — `<TerminalsLayer>` — never changes), so
 * the XTerminal stays mounted. After each render we imperatively `appendChild`
 * the host into the current LeafSlot's DOM, so the terminal visually appears
 * inside the layout tree even though React owns it from elsewhere.
 *
 * `createPortal`'s "container changed" path remounts children, which is why we
 * portal into a stable host instead of directly into the slot.
 */
type SlotMap = Map<string, HTMLDivElement>

interface SlotRegistry {
  setSlot(paneId: string, el: HTMLDivElement | null): void
  getOrCreateHost(paneId: string): HTMLDivElement
  pruneHosts(activePaneIds: ReadonlySet<string>): void
  reattachAll(): void
  subscribe(listener: () => void): () => void
}

function createSlotRegistry(): SlotRegistry {
  const slots: SlotMap = new Map()
  const hosts: SlotMap = new Map()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  const reattach = (paneId: string) => {
    const slot = slots.get(paneId)
    const host = hosts.get(paneId)
    if (!slot || !host) return
    if (host.parentElement !== slot) {
      slot.appendChild(host)
    }
  }

  return {
    setSlot(paneId, el) {
      if (el) {
        slots.set(paneId, el)
        // Move the host into the new slot synchronously when possible.
        reattach(paneId)
        notify()
      } else if (slots.has(paneId)) {
        slots.delete(paneId)
        notify()
      }
    },
    getOrCreateHost(paneId) {
      let host = hosts.get(paneId)
      if (!host) {
        host = document.createElement('div')
        host.style.height = '100%'
        host.style.width = '100%'
        hosts.set(paneId, host)
      }
      return host
    },
    pruneHosts(activePaneIds) {
      for (const id of Array.from(hosts.keys())) {
        if (!activePaneIds.has(id)) {
          const host = hosts.get(id)
          host?.remove()
          hosts.delete(id)
        }
      }
    },
    reattachAll() {
      for (const id of slots.keys()) reattach(id)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  parentId: string
  index: number
  tabId: string
}

function ResizeHandle({ direction, parentId, index, tabId }: ResizeHandleProps) {
  const isVerticalBar = direction === 'horizontal'
  const dragStateRef = useRef<{
    startPos: number
    parentSize: number
  } | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startPos = isVerticalBar ? e.clientX : e.clientY
    const parent = (e.target as HTMLElement).parentElement
    if (!parent) return
    const parentSize = isVerticalBar ? parent.offsetWidth : parent.offsetHeight

    dragStateRef.current = { startPos, parentSize }

    const onMouseMove = (ev: MouseEvent) => {
      const state = dragStateRef.current
      if (!state) return
      const currentPos = isVerticalBar ? ev.clientX : ev.clientY
      const delta = currentPos - state.startPos
      const deltaPercent = (delta / state.parentSize) * 100
      // Reset startPos so delta is incremental
      dragStateRef.current = { ...state, startPos: currentPos }
      useTerminalStore.getState().resizePanes(tabId, parentId, index, deltaPercent)
    }

    const onMouseUp = () => {
      dragStateRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = isVerticalBar ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [isVerticalBar, parentId, index, tabId])

  return (
    <div
      className={`${
        isVerticalBar
          ? 'w-1 cursor-col-resize hover:bg-accent/50'
          : 'h-1 cursor-row-resize hover:bg-accent/50'
      } bg-border flex-shrink-0 transition-colors`}
      onMouseDown={handleMouseDown}
    />
  )
}

interface LeafSlotProps {
  paneId: string
  tabId: string
  isActive: boolean
  registry: SlotRegistry
}

/**
 * Empty placeholder div that owns the host element for its leaf. On (re)mount
 * the slot adopts the leaf's persistent host — `<TerminalsLayer>` will
 * `createPortal` the XTerminal into that host, and React doesn't tear down the
 * portal because the host's DOM identity (and its React parent) never change.
 */
function LeafSlot({ paneId, tabId, isActive, registry }: LeafSlotProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    registry.setSlot(paneId, ref.current)
    return () => {
      registry.setSlot(paneId, null)
    }
  }, [paneId, registry])

  return (
    <div
      ref={ref}
      className={`h-full w-full border ${
        isActive ? 'border-accent/60' : 'border-transparent'
      }`}
      onClick={() => {
        useTerminalStore.getState().setActivePane(tabId, paneId)
      }}
    />
  )
}

interface PaneLayoutProps {
  pane: TerminalPane
  tabId: string
  activePaneId: string
  registry: SlotRegistry
}

/** Renders the layout tree (flex containers + leaf slots). No XTerminal here. */
function PaneLayout({ pane, tabId, activePaneId, registry }: PaneLayoutProps) {
  if (pane.children && pane.children.length > 0) {
    const isHorizontal = pane.direction === 'horizontal'
    return (
      <div className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full w-full`}>
        {pane.children.map((child, idx) => (
          <Fragment key={child.id}>
            {idx > 0 && (
              <ResizeHandle
                direction={pane.direction ?? 'horizontal'}
                parentId={pane.id}
                index={idx}
                tabId={tabId}
              />
            )}
            <div
              style={{ flexBasis: `${child.size ?? 50}%` }}
              className="flex-shrink-0 flex-grow-0 min-w-0 min-h-0 overflow-hidden"
            >
              <PaneLayout
                pane={child}
                tabId={tabId}
                activePaneId={activePaneId}
                registry={registry}
              />
            </div>
          </Fragment>
        ))}
      </div>
    )
  }

  return (
    <LeafSlot
      paneId={pane.id}
      tabId={tabId}
      isActive={pane.id === activePaneId}
      registry={registry}
    />
  )
}

/** Walk the pane tree and collect every leaf. Order is stable per tree shape. */
function collectLeaves(panes: TerminalPane[]): TerminalPane[] {
  const out: TerminalPane[] = []
  const walk = (p: TerminalPane) => {
    if (p.children && p.children.length > 0) {
      p.children.forEach(walk)
    } else {
      out.push(p)
    }
  }
  panes.forEach(walk)
  return out
}

interface TerminalsLayerProps {
  tab: TerminalTab
  registry: SlotRegistry
  tabVisible: boolean
  activeTabId: string | null
  searchVisible: boolean
  cwd: string
}

/**
 * Mounts one `<XTerminal>` per leaf, keyed by leaf id. Each terminal stays
 * mounted as long as its leaf id appears in the tree, regardless of how the
 * layout tree restructures (split, resize, branch collapse on remove). The
 * actual DOM is portaled into the matching `<LeafSlot>`.
 */
function TerminalsLayer({
  tab,
  registry,
  tabVisible,
  activeTabId,
  searchVisible,
  cwd,
}: TerminalsLayerProps) {
  // Re-render when slots come/go so we can re-attach hosts to fresh slot DOM.
  const [, force] = useState(0)
  useEffect(() => {
    return registry.subscribe(() => force((n) => n + 1))
  }, [registry])

  const leaves = useMemo(() => collectLeaves(tab.panes), [tab.panes])

  // Prune hosts for leaves that no longer exist (e.g. after `removePane`),
  // and re-attach surviving hosts to their slots after every render in case
  // React mounted the slot div *after* the registry's setSlot fired its first
  // attach attempt.
  useEffect(() => {
    const ids = new Set(leaves.map((l) => l.id))
    registry.pruneHosts(ids)
    registry.reattachAll()
  })

  return (
    <>
      {leaves.map((leaf) => {
        const host = registry.getOrCreateHost(leaf.id)
        const isActive = leaf.id === tab.activePaneId
        const effectiveAgent = leaf.agent
          ? { teamId: leaf.agent.teamId, agentName: leaf.agent.agentName }
          : tab.agent
            ? { teamId: tab.agent.teamId, agentName: tab.agent.agentName }
            : undefined
        return createPortal(
          <XTerminal
            tabId={tab.id}
            paneId={leaf.id}
            cwd={cwd}
            agent={effectiveAgent}
            isActive={isActive && tabVisible && tab.id === activeTabId}
            searchVisible={searchVisible && isActive && tabVisible}
            onTitleChange={(title) => {
              useTerminalStore.getState().updateTabTitle(tab.id, title)
            }}
            onPtyCreated={(ptyId) => {
              useTerminalStore.getState().setTabPtyId(tab.id, leaf.id, ptyId)
            }}
          />,
          host,
          leaf.id,
        )
      })}
    </>
  )
}

interface TabViewProps {
  tab: TerminalTab
  isActiveTab: boolean
  activeTabId: string | null
  searchVisible: boolean
  cwd: string
}

/**
 * One TabView per tab. Owns its own slot registry so terminals from different
 * tabs don't fight over slot ids (paneIds are uuids so collision is unlikely,
 * but the per-tab boundary keeps reasoning simple).
 */
function TabView({ tab, isActiveTab, activeTabId, searchVisible, cwd }: TabViewProps) {
  const registryRef = useRef<SlotRegistry | null>(null)
  if (!registryRef.current) {
    registryRef.current = createSlotRegistry()
  }
  const registry = registryRef.current

  return (
    <div
      className={`absolute inset-0 flex ${isActiveTab ? '' : 'hidden'}`}
      aria-hidden={!isActiveTab}
    >
      {tab.panes.map((pane) => (
        <div
          key={pane.id}
          style={{ flexBasis: `${pane.size ?? 100}%` }}
          className="flex-shrink-0 flex-grow-0 min-w-0 min-h-0 overflow-hidden"
        >
          <PaneLayout
            pane={pane}
            tabId={tab.id}
            activePaneId={tab.activePaneId}
            registry={registry}
          />
        </div>
      ))}
      <TerminalsLayer
        tab={tab}
        registry={registry}
        tabVisible={isActiveTab}
        activeTabId={activeTabId}
        searchVisible={searchVisible}
        cwd={cwd}
      />
    </div>
  )
}

export function TerminalPanel() {
  const { tabs, activeTabId, searchVisible } = useTerminalStore()
  const { activeWorkspace } = useWorkspaceStore()

  // Keep *every* tab mounted — including tabs from workspaces other than the
  // current one. Filtering the render list by workspace was the old bug: it
  // unmounted the other workspaces' XTerminals and disposed their PTYs, so
  // switching back gave the user fresh shells. Now we always render; only the
  // active tab that belongs to the current workspace (or is unattached) is
  // visible. Everything else sits behind `display:none` with its PTY alive.
  const activeCandidate = tabs.find((t) => t.id === activeTabId)
  const activeTabVisibleHere =
    activeCandidate &&
    (!activeCandidate.workspaceId || activeCandidate.workspaceId === activeWorkspace?.id)

  return (
    <div className="flex flex-col h-full bg-surface-0">
      <TerminalTabs />
      <div className="flex-1 relative">
        {tabs.map((tab) => {
          const belongsHere = !tab.workspaceId || tab.workspaceId === activeWorkspace?.id
          const isActiveTab = tab.id === activeTabId && belongsHere
          return (
            <TabView
              key={tab.id}
              tab={tab}
              isActiveTab={isActiveTab}
              activeTabId={activeTabId}
              searchVisible={searchVisible}
              cwd={tab.cwd || activeWorkspace?.path || ''}
            />
          )
        })}
        {!activeTabVisibleHere && (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            No terminal open. Press Cmd+T to create one.
          </div>
        )}
      </div>
    </div>
  )
}
