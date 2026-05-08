// TerminalAreaV2 — real xterm + node-pty terminal area for the v2 workspace shell.
//
// Replaces the visual mock TerminalTabsArea that lived in WorkspaceV2.tsx. We
// reuse v1's `XTerminal` component verbatim and replicate the
// "portal-into-persistent-host" architecture from TerminalPanel.tsx so PTYs
// survive split / re-parent / workspace switch. Only the surrounding chrome
// (tab strip + split / search controls) is re-skinned with v2 design tokens.
//
// Lifecycle invariants preserved from v1:
//  - One `<XTerminal>` per leaf paneId, kept mounted as long as the leaf id
//    appears in the tree (regardless of layout reshape).
//  - Terminals from inactive tabs (and tabs from other workspaces) stay mounted
//    behind `display:none` — so PTYs do not die on workspace switch.
//  - Splitting wraps the leaf in a branch node (50/50), preserving the
//    original leaf's host element (and PTY) on one side.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTerminalStore } from '@/stores/terminal'
import { useWorkspaceStore } from '@/stores/workspace'
import { XTerminal } from './XTerminal'
import type { TerminalPane, TerminalTab } from '@/types'
import { Icon } from './icons'
import { Dot } from './primitives'
import type { WorkspaceSummary } from './types'

// ─── Slot registry (PR-B portal architecture) ─────────────────────────

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
          hosts.get(id)?.remove()
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

// ─── Resize handle ────────────────────────────────────────────────────

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  parentId: string
  index: number
  tabId: string
}

function ResizeHandle({ direction, parentId, index, tabId }: ResizeHandleProps) {
  const isVerticalBar = direction === 'horizontal'
  const dragStateRef = useRef<{ startPos: number; parentSize: number } | null>(null)
  const [hover, setHover] = useState(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [isVerticalBar, parentId, index, tabId],
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        background: hover ? 'var(--accent-line)' : 'var(--line-1)',
        transition: 'background 120ms',
        ...(isVerticalBar
          ? { width: 1, cursor: 'col-resize' }
          : { height: 1, cursor: 'row-resize' }),
      }}
    />
  )
}

// ─── LeafSlot (host adopter) ──────────────────────────────────────────

interface LeafSlotProps {
  paneId: string
  tabId: string
  isActive: boolean
  registry: SlotRegistry
}

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
      onClick={() => useTerminalStore.getState().setActivePane(tabId, paneId)}
      style={{
        height: '100%',
        width: '100%',
        border: `1px solid ${isActive ? 'var(--accent-line)' : 'transparent'}`,
        boxSizing: 'border-box',
      }}
    />
  )
}

// ─── PaneLayout (split tree) ──────────────────────────────────────────

interface PaneLayoutProps {
  pane: TerminalPane
  tabId: string
  activePaneId: string
  registry: SlotRegistry
}

function PaneLayout({ pane, tabId, activePaneId, registry }: PaneLayoutProps) {
  if (pane.children && pane.children.length > 0) {
    const isHorizontal = pane.direction === 'horizontal'
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
          height: '100%',
          width: '100%',
        }}
      >
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
              style={{
                flexBasis: `${child.size ?? 50}%`,
                flexShrink: 0,
                flexGrow: 0,
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
              }}
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

// ─── TerminalsLayer ───────────────────────────────────────────────────

interface TerminalsLayerProps {
  tab: TerminalTab
  registry: SlotRegistry
  tabVisible: boolean
  activeTabId: string | null
  searchVisible: boolean
  cwd: string
}

function TerminalsLayer({
  tab,
  registry,
  tabVisible,
  activeTabId,
  searchVisible,
  cwd,
}: TerminalsLayerProps) {
  const [, force] = useState(0)
  useEffect(() => registry.subscribe(() => force((n) => n + 1)), [registry])

  const leaves = useMemo(() => collectLeaves(tab.panes), [tab.panes])

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

// ─── TabView ──────────────────────────────────────────────────────────

interface TabViewProps {
  tab: TerminalTab
  isActiveTab: boolean
  activeTabId: string | null
  searchVisible: boolean
  cwd: string
}

function TabView({ tab, isActiveTab, activeTabId, searchVisible, cwd }: TabViewProps) {
  const registryRef = useRef<SlotRegistry | null>(null)
  if (!registryRef.current) registryRef.current = createSlotRegistry()
  const registry = registryRef.current

  return (
    <div
      aria-hidden={!isActiveTab}
      style={{
        position: 'absolute',
        inset: 0,
        display: isActiveTab ? 'flex' : 'none',
      }}
    >
      {tab.panes.map((pane) => (
        <div
          key={pane.id}
          style={{
            flexBasis: `${pane.size ?? 100}%`,
            flexShrink: 0,
            flexGrow: 0,
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
          }}
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

// ─── Tab strip (v2-toned chrome) ──────────────────────────────────────

interface TabStripProps {
  tabs: TerminalTab[]
  activeTabId: string | null
  workspaceId?: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onSplit: () => void
  splitDisabled: boolean
  onToggleSearch: () => void
}

function TabStrip({
  tabs,
  activeTabId,
  workspaceId,
  onSelect,
  onClose,
  onNew,
  onSplit,
  splitDisabled,
  onToggleSearch,
}: TabStripProps) {
  const visibleTabs = tabs.filter(
    (t) => !t.workspaceId || t.workspaceId === workspaceId,
  )
  const [listOpen, setListOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setListOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setListOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [listOpen])

  return (
    <div
      className="ns"
      style={{
        height: 30,
        flexShrink: 0,
        background: 'var(--bg-1)',
        borderBottom: '1px solid var(--line-1)',
        display: 'flex',
        alignItems: 'stretch',
        paddingLeft: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          flex: 1,
          overflowX: 'auto',
          minWidth: 0,
        }}
        className="no-scrollbar"
      >
        {visibleTabs.map((t) => {
          const active = t.id === activeTabId
          return (
            <TabButton
              key={t.id}
              tab={t}
              active={active}
              onSelect={() => onSelect(t.id)}
              onClose={() => onClose(t.id)}
            />
          )
        })}
        <button
          onClick={onNew}
          title="New Terminal (Cmd+T)"
          style={{
            padding: '0 8px',
            color: 'var(--text-3)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <Icon.Plus size={12} />
        </button>
      </div>
      <div
        ref={listRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 8px',
          position: 'relative',
        }}
      >
        <button
          onClick={onSplit}
          disabled={splitDisabled}
          title="Split (Cmd+Shift+H)"
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: 'transparent',
            border: '1px solid transparent',
            color: splitDisabled ? 'var(--text-4)' : 'var(--text-3)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: splitDisabled ? 'not-allowed' : 'pointer',
            opacity: splitDisabled ? 0.4 : 1,
          }}
        >
          <Icon.Layers size={12} />
        </button>
        <button
          onClick={onToggleSearch}
          title="Search"
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
          <Icon.Search size={12} />
        </button>
        {/* "≡" tab-list dropdown — surfaces every open tab in this workspace
            so users with many tabs can still jump / close even when the
            horizontal strip overflows. */}
        <button
          onClick={() => setListOpen((v) => !v)}
          title="All tabs"
          aria-haspopup="listbox"
          aria-expanded={listOpen}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: listOpen ? 'var(--bg-3)' : 'transparent',
            border: `1px solid ${listOpen ? 'var(--line-2)' : 'transparent'}`,
            color: 'var(--text-3)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            fontFamily: 'var(--font-mono)',
          }}
        >
          ≡
        </button>
        {listOpen && (
          <div
            role="listbox"
            style={{
              position: 'absolute',
              top: '100%',
              right: 4,
              marginTop: 4,
              minWidth: 240,
              maxWidth: 360,
              maxHeight: 360,
              overflowY: 'auto',
              background: 'var(--bg-2)',
              border: '1px solid var(--line-2)',
              borderRadius: 6,
              boxShadow: 'var(--shadow-pop)',
              zIndex: 30,
              padding: '4px 0',
            }}
          >
            {visibleTabs.length === 0 && (
              <div
                style={{
                  padding: '10px 12px',
                  fontSize: 11.5,
                  color: 'var(--text-3)',
                }}
              >
                No tabs.
              </div>
            )}
            {visibleTabs.map((tt) => {
              const active = tt.id === activeTabId
              return (
                <div
                  key={tt.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSelect(tt.id)
                    setListOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    background: active ? 'var(--bg-3)' : 'transparent',
                    color: active ? 'var(--text-1)' : 'var(--text-2)',
                    borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <Dot
                    color={active ? 'var(--success)' : 'var(--text-4)'}
                    pulse={active}
                    size={5}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tt.title || 'Terminal'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose(tt.id)
                    }}
                    title="Close"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <Icon.X size={11} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

interface TabButtonProps {
  tab: TerminalTab
  active: boolean
  onSelect: () => void
  onClose: () => void
}

function TabButton({ tab, active, onSelect, onClose }: TabButtonProps) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          onClose()
        }
      }}
      style={{
        padding: '0 12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: active ? '#06080b' : hover ? 'var(--bg-2)' : 'transparent',
        borderTop: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        borderRight: '1px solid var(--line-1)',
        color: active ? 'var(--text-1)' : 'var(--text-3)',
        fontSize: 11.5,
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <Dot
        color={active ? 'var(--success)' : 'var(--text-4)'}
        pulse={active}
        size={5}
      />
      <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tab.title || 'Terminal'}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        style={{
          opacity: hover || active ? 0.6 : 0,
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          marginLeft: 2,
          transition: 'opacity 120ms',
        }}
        title="Close"
      >
        <Icon.X size={11} />
      </button>
    </div>
  )
}

// ─── TerminalAreaV2 ───────────────────────────────────────────────────

export interface TerminalAreaV2Props {
  workspace: WorkspaceSummary
}

/**
 * Real xterm + node-pty terminal area for the v2 workspace shell.
 *
 * Wires the terminal store (tabs / panes / search) to the active workspace
 * surfaced by `useWorkspaceStore` — that store owns the live `Workspace`
 * (with the resolved cwd) while the `WorkspaceSummary` prop only carries
 * presentation-level metadata (path, branch, harness label).
 */
export function TerminalAreaV2(_props: TerminalAreaV2Props) {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const searchVisible = useTerminalStore((s) => s.searchVisible)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)

  // Derive the same "active tab visible here?" rule used in v1 so workspace
  // switches don't tear down PTYs that belong to other workspaces.
  const activeCandidate = tabs.find((t) => t.id === activeTabId)
  const activeTabVisibleHere =
    activeCandidate &&
    (!activeCandidate.workspaceId || activeCandidate.workspaceId === activeWorkspace?.id)

  const onNew = useCallback(() => {
    useTerminalStore.getState().addTab(activeWorkspace?.path, activeWorkspace?.id)
  }, [activeWorkspace])

  const onSelect = useCallback((id: string) => {
    useTerminalStore.getState().setActiveTab(id)
  }, [])

  const onClose = useCallback((id: string) => {
    useTerminalStore.getState().removeTab(id)
  }, [])

  const onSplit = useCallback(() => {
    const state = useTerminalStore.getState()
    const tab = state.tabs.find((t) => t.id === state.activeTabId)
    if (tab && !tab.agent) {
      state.splitPane(tab.id, tab.activePaneId, 'horizontal')
    }
  }, [])

  const onToggleSearch = useCallback(() => {
    useTerminalStore.getState().toggleSearch()
  }, [])

  const splitDisabled = !!activeCandidate?.agent

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: '#06080b',
      }}
    >
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        workspaceId={activeWorkspace?.id}
        onSelect={onSelect}
        onClose={onClose}
        onNew={onNew}
        onSplit={onSplit}
        splitDisabled={splitDisabled}
        onToggleSearch={onToggleSearch}
      />
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {tabs.map((tab) => {
          const belongsHere =
            !tab.workspaceId || tab.workspaceId === activeWorkspace?.id
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
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-3)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              pointerEvents: 'none',
            }}
          >
            No terminal open. Press Cmd+T to create one.
          </div>
        )}
      </div>
    </div>
  )
}
