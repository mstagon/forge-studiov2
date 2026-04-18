import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TerminalTab, TerminalPane } from '@/types'

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  searchVisible: boolean

  addTab: (cwd?: string, workspaceId?: string) => TerminalTab
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabTitle: (id: string, title: string) => void
  setTabPtyId: (tabId: string, paneId: string, ptyId: string) => void

  splitPane: (tabId: string, paneId: string, direction: 'horizontal' | 'vertical') => string
  removePane: (tabId: string, paneId: string) => void
  setActivePane: (tabId: string, paneId: string) => void
  resizePanes: (tabId: string, parentId: string, index: number, deltaPercent: number) => void

  nextTab: () => void
  prevTab: () => void

  toggleSearch: () => void
  setSearchVisible: (visible: boolean) => void
}

function createPane(): TerminalPane {
  return { id: uuid(), ptyId: null, size: 50 }
}

/** Recursively find a pane by id in the tree */
function findPaneInTree(panes: TerminalPane[], id: string): TerminalPane | null {
  for (const pane of panes) {
    if (pane.id === id) return pane
    if (pane.children) {
      const found = findPaneInTree(pane.children, id)
      if (found) return found
    }
  }
  return null
}

/** Recursively replace a pane by id, returning a new tree */
function replacePaneInTree(panes: TerminalPane[], targetId: string, replacement: TerminalPane): TerminalPane[] {
  return panes.map((pane) => {
    if (pane.id === targetId) return replacement
    if (pane.children) {
      return { ...pane, children: replacePaneInTree(pane.children, targetId, replacement) }
    }
    return pane
  })
}

/** Recursively remove a pane by id, collapsing single-child branches */
function removePaneFromTree(panes: TerminalPane[], targetId: string): TerminalPane[] {
  const result: TerminalPane[] = []
  for (const pane of panes) {
    if (pane.id === targetId) continue
    if (pane.children) {
      const newChildren = removePaneFromTree(pane.children, targetId)
      if (newChildren.length === 0) continue
      if (newChildren.length === 1) {
        // Collapse: replace branch with its only child, preserving the child's size from the branch
        const onlyChild = { ...newChildren[0], size: pane.size }
        result.push(onlyChild)
      } else {
        result.push({ ...pane, children: newChildren })
      }
    } else {
      result.push(pane)
    }
  }
  return result
}

/** Recursively update ptyId for a specific pane */
function setPtyIdInTree(panes: TerminalPane[], paneId: string, ptyId: string): TerminalPane[] {
  return panes.map((pane) => {
    if (pane.id === paneId) return { ...pane, ptyId }
    if (pane.children) {
      return { ...pane, children: setPtyIdInTree(pane.children, paneId, ptyId) }
    }
    return pane
  })
}

/** Get the first leaf pane in the tree */
function getFirstLeaf(pane: TerminalPane): TerminalPane {
  if (pane.children && pane.children.length > 0) {
    return getFirstLeaf(pane.children[0])
  }
  return pane
}

/** Check if a pane id exists anywhere in the tree */
function paneExistsInTree(panes: TerminalPane[], id: string): boolean {
  return findPaneInTree(panes, id) !== null
}

/** Count total leaf panes in the tree */
function countLeaves(panes: TerminalPane[]): number {
  let count = 0
  for (const pane of panes) {
    if (pane.children && pane.children.length > 0) {
      count += countLeaves(pane.children)
    } else {
      count++
    }
  }
  return count
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  searchVisible: false,

  addTab: (cwd?: string, workspaceId?: string) => {
    const pane = createPane()
    pane.size = 100
    const tab: TerminalTab = {
      id: uuid(),
      title: 'Terminal',
      ptyId: null,
      cwd: cwd || '',
      workspaceId,
      panes: [pane],
      activePaneId: pane.id,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }))
    return tab
  },

  removeTab: (id: string) => {
    set((state) => {
      const filtered = state.tabs.filter((t) => t.id !== id)
      let activeTabId = state.activeTabId
      if (activeTabId === id) {
        const idx = state.tabs.findIndex((t) => t.id === id)
        activeTabId = filtered[Math.min(idx, filtered.length - 1)]?.id || null
      }
      return { tabs: filtered, activeTabId }
    })
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),

  updateTabTitle: (id: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }))
  },

  setTabPtyId: (tabId: string, paneId: string, ptyId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const isOnlyLeaf = countLeaves(t.panes) === 1
        return {
          ...t,
          ptyId: isOnlyLeaf ? ptyId : t.ptyId,
          panes: setPtyIdInTree(t.panes, paneId, ptyId),
        }
      }),
    }))
  },

  splitPane: (tabId: string, paneId: string, direction: 'horizontal' | 'vertical') => {
    const newPane = createPane()
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const targetPane = findPaneInTree(t.panes, paneId)
        if (!targetPane) return t

        // Create a branch node that replaces the target pane
        const branchNode: TerminalPane = {
          id: uuid(),
          ptyId: null,
          direction,
          children: [
            { ...targetPane, size: 50 },
            { ...newPane, size: 50 },
          ],
          size: targetPane.size,
        }

        return {
          ...t,
          panes: replacePaneInTree(t.panes, paneId, branchNode),
          activePaneId: newPane.id,
        }
      }),
    }))
    return newPane.id
  },

  removePane: (tabId: string, paneId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const newPanes = removePaneFromTree(t.panes, paneId)
        if (newPanes.length === 0) return t
        // If active pane was removed, pick the first leaf
        let newActivePaneId = t.activePaneId
        if (!paneExistsInTree(newPanes, newActivePaneId)) {
          newActivePaneId = getFirstLeaf(newPanes[0]).id
        }
        return {
          ...t,
          panes: newPanes,
          activePaneId: newActivePaneId,
        }
      }),
    }))
  },

  setActivePane: (tabId: string, paneId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, activePaneId: paneId } : t
      ),
    }))
  },

  resizePanes: (tabId: string, parentId: string, index: number, deltaPercent: number) => {
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        const parent = findPaneInTree(t.panes, parentId)
        if (!parent?.children || index < 1 || index >= parent.children.length) return t

        const prevChild = parent.children[index - 1]
        const currChild = parent.children[index]
        const prevSize = prevChild.size ?? 50
        const currSize = currChild.size ?? 50

        // Clamp to minimum 20% of the combined size
        const totalSize = prevSize + currSize
        const minSize = Math.max(totalSize * 0.2, 5)
        let newPrevSize = prevSize + deltaPercent
        let newCurrSize = currSize - deltaPercent

        if (newPrevSize < minSize) {
          newPrevSize = minSize
          newCurrSize = totalSize - minSize
        }
        if (newCurrSize < minSize) {
          newCurrSize = minSize
          newPrevSize = totalSize - minSize
        }

        const newChildren = parent.children.map((child, i) => {
          if (i === index - 1) return { ...child, size: newPrevSize }
          if (i === index) return { ...child, size: newCurrSize }
          return child
        })

        const updatedParent = { ...parent, children: newChildren }
        return {
          ...t,
          panes: replacePaneInTree(t.panes, parentId, updatedParent),
        }
      }),
    }))
  },

  nextTab: () => {
    const { tabs, activeTabId } = get()
    const active = tabs.find((t) => t.id === activeTabId)
    const ws = active?.workspaceId
    // Only navigate within the same workspace's tab group (or among
    // unattached tabs if the current active is unattached).
    const visible = tabs.filter((t) => t.workspaceId === ws)
    if (visible.length < 2) return
    const idx = visible.findIndex((t) => t.id === activeTabId)
    const next = visible[(idx + 1) % visible.length]
    set({ activeTabId: next.id })
  },

  prevTab: () => {
    const { tabs, activeTabId } = get()
    const active = tabs.find((t) => t.id === activeTabId)
    const ws = active?.workspaceId
    const visible = tabs.filter((t) => t.workspaceId === ws)
    if (visible.length < 2) return
    const idx = visible.findIndex((t) => t.id === activeTabId)
    const prev = visible[(idx - 1 + visible.length) % visible.length]
    set({ activeTabId: prev.id })
  },

  toggleSearch: () => set((state) => ({ searchVisible: !state.searchVisible })),
  setSearchVisible: (visible: boolean) => set({ searchVisible: visible }),
}))
