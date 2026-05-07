import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TerminalTab, TerminalPane, TerminalAgentBinding } from '@/types'

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  searchVisible: boolean

  addTab: (cwd?: string, workspaceId?: string) => TerminalTab
  addAgentTab: (agent: TerminalAgentBinding, title: string) => TerminalTab
  createSplitTeamTab: (
    teamId: string,
    members: Array<{ agentName: string; tmuxPaneId: string }>,
    title: string,
  ) => TerminalTab | null
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

/** Pick a tmux-style grid column count for N panes */
function pickGridCols(n: number): number {
  if (n <= 1) return 1
  if (n <= 3) return n          // 2 → 1×2, 3 → 1×3
  if (n === 4) return 2         // 2×2
  if (n <= 6) return 3          // 2×3
  if (n <= 9) return 3          // 3×3
  return 3                      // 3×N for very large teams (scrolls)
}

/** Build a balanced grid pane tree from N leaf panes */
function buildGridTree(leaves: TerminalPane[], cols: number): TerminalPane {
  if (leaves.length === 1) {
    return { ...leaves[0], size: 100 }
  }
  const rows: TerminalPane[][] = []
  for (let i = 0; i < leaves.length; i += cols) {
    rows.push(leaves.slice(i, i + cols))
  }
  const rowSize = 100 / rows.length
  const rowNodes: TerminalPane[] = rows.map((rowLeaves) => {
    if (rowLeaves.length === 1) {
      return { ...rowLeaves[0], size: rowSize }
    }
    const colSize = 100 / rowLeaves.length
    return {
      id: uuid(),
      ptyId: null,
      direction: 'horizontal',
      size: rowSize,
      children: rowLeaves.map((p) => ({ ...p, size: colSize })),
    }
  })
  if (rowNodes.length === 1) return rowNodes[0]
  return {
    id: uuid(),
    ptyId: null,
    direction: 'vertical',
    size: 100,
    children: rowNodes,
  }
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

/**
 * Pick the next available "Terminal", "Terminal (2)", "Terminal (3)" ... title
 * within the given workspace. Only active tabs' titles are considered, so a
 * closed tab frees its number for reuse.
 */
function nextTerminalTitle(tabs: TerminalTab[], workspaceId?: string): string {
  const base = 'Terminal'
  const siblings = tabs.filter((t) => t.workspaceId === workspaceId)
  const usedTitles = new Set(siblings.map((t) => t.title))
  if (!usedTitles.has(base)) return base
  let n = 2
  while (usedTitles.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  searchVisible: false,

  addTab: (cwd?: string, workspaceId?: string) => {
    const pane = createPane()
    pane.size = 100
    const title = nextTerminalTitle(get().tabs, workspaceId)
    const tab: TerminalTab = {
      id: uuid(),
      title,
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

  addAgentTab: (agent: TerminalAgentBinding, title: string) => {
    // Reuse an existing tab bound to the same tmux pane if it's still around,
    // so double-clicking an agent doesn't spawn a zombie.
    const existing = get().tabs.find(
      (t) => t.agent && t.agent.teamId === agent.teamId && t.agent.agentName === agent.agentName
    )
    if (existing) {
      set({ activeTabId: existing.id })
      return existing
    }
    const pane = createPane()
    pane.size = 100
    const tab: TerminalTab = {
      id: uuid(),
      title,
      ptyId: null,
      cwd: '',
      agent,
      panes: [pane],
      activePaneId: pane.id,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }))
    return tab
  },

  createSplitTeamTab: (teamId, members, title) => {
    const eligible = members.filter((m) => m.tmuxPaneId)
    if (eligible.length === 0) return null

    // Reuse an existing split-team tab for the same team if one is already open.
    const existing = get().tabs.find((t) => t.title === title && t.teamId === teamId)
    if (existing) {
      set({ activeTabId: existing.id })
      return existing
    }

    const leaves: TerminalPane[] = eligible.map((m) => ({
      id: uuid(),
      ptyId: null,
      agent: { teamId, agentName: m.agentName, tmuxPaneId: m.tmuxPaneId },
    }))
    const cols = pickGridCols(eligible.length)
    const root = buildGridTree(leaves, cols)
    const firstLeaf = getFirstLeaf(root)
    const tab: TerminalTab = {
      id: uuid(),
      title,
      ptyId: null,
      cwd: '',
      teamId,
      panes: [root],
      activePaneId: firstLeaf.id,
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
