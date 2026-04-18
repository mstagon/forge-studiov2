import { Fragment, useRef, useCallback } from 'react'
import { useTerminalStore } from '@/stores/terminal'
import { useWorkspaceStore } from '@/stores/workspace'
import { TerminalTabs } from './TerminalTabs'
import { XTerminal } from './XTerminal'
import type { TerminalPane } from '@/types'

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

interface PaneViewProps {
  pane: TerminalPane
  tabId: string
  cwd: string
  activePaneId: string
  activeTabId: string | null
  searchVisible: boolean
  depth: number
}

function PaneView({ pane, tabId, cwd, activePaneId, activeTabId, searchVisible, depth }: PaneViewProps) {
  if (pane.children && pane.children.length > 0) {
    // Branch node: render children in a flex container
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
              <PaneView
                pane={child}
                tabId={tabId}
                cwd={cwd}
                activePaneId={activePaneId}
                activeTabId={activeTabId}
                searchVisible={searchVisible}
                depth={depth + 1}
              />
            </div>
          </Fragment>
        ))}
      </div>
    )
  }

  // Leaf node: render terminal
  const isActive = pane.id === activePaneId
  return (
    <div
      className={`h-full w-full border ${
        isActive ? 'border-accent/60' : 'border-transparent'
      }`}
      onClick={() => {
        useTerminalStore.getState().setActivePane(tabId, pane.id)
      }}
    >
      <XTerminal
        tabId={tabId}
        paneId={pane.id}
        cwd={cwd}
        isActive={isActive && tabId === activeTabId}
        searchVisible={searchVisible && isActive}
        onTitleChange={(title) => {
          useTerminalStore.getState().updateTabTitle(tabId, title)
        }}
        onPtyCreated={(ptyId) => {
          useTerminalStore.getState().setTabPtyId(tabId, pane.id, ptyId)
        }}
      />
    </div>
  )
}

export function TerminalPanel() {
  const { tabs, activeTabId, searchVisible } = useTerminalStore()
  const { activeWorkspace } = useWorkspaceStore()
  const candidate = tabs.find((t) => t.id === activeTabId)
  // Only show the active tab if it belongs to the currently selected workspace
  // (or is unattached). Tabs from other workspaces stay alive in the store
  // but are hidden until the user switches back.
  const activeTab =
    candidate &&
    (!candidate.workspaceId || candidate.workspaceId === activeWorkspace?.id)
      ? candidate
      : undefined

  return (
    <div className="flex flex-col h-full bg-surface-0">
      <TerminalTabs />
      <div className="flex-1 relative">
        {activeTab ? (
          <div className="absolute inset-0 flex">
            {activeTab.panes.map((pane) => (
              <div
                key={pane.id}
                style={{ flexBasis: `${pane.size ?? 100}%` }}
                className="flex-shrink-0 flex-grow-0 min-w-0 min-h-0 overflow-hidden"
              >
                <PaneView
                  pane={pane}
                  tabId={activeTab.id}
                  cwd={activeWorkspace?.path || ''}
                  activePaneId={activeTab.activePaneId}
                  activeTabId={activeTabId}
                  searchVisible={searchVisible}
                  depth={0}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            No terminal open. Press Cmd+T to create one.
          </div>
        )}
      </div>
    </div>
  )
}
