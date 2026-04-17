import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TerminalTab, TerminalPane } from '@/types'

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  searchVisible: boolean

  addTab: (cwd?: string) => TerminalTab
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabTitle: (id: string, title: string) => void
  setTabPtyId: (tabId: string, paneId: string, ptyId: string) => void

  splitPane: (tabId: string, paneId: string, direction: 'horizontal' | 'vertical') => string
  removePane: (tabId: string, paneId: string) => void
  setActivePane: (tabId: string, paneId: string) => void

  nextTab: () => void
  prevTab: () => void

  toggleSearch: () => void
  setSearchVisible: (visible: boolean) => void
}

function createPane(ptyId?: string): TerminalPane {
  return { id: uuid(), ptyId: ptyId || null }
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  searchVisible: false,

  addTab: (cwd?: string) => {
    const pane = createPane()
    const tab: TerminalTab = {
      id: uuid(),
      title: 'Terminal',
      ptyId: null,
      cwd: cwd || '',
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
        return {
          ...t,
          ptyId: t.panes.length === 1 ? ptyId : t.ptyId,
          panes: t.panes.map((p) => (p.id === paneId ? { ...p, ptyId } : p)),
        }
      }),
    }))
  },

  splitPane: (tabId: string, _paneId: string, direction: 'horizontal' | 'vertical') => {
    const newPane = createPane()
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t
        return {
          ...t,
          panes: [...t.panes, { ...newPane, direction }],
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
        const filtered = t.panes.filter((p) => p.id !== paneId)
        if (filtered.length === 0) return t
        return {
          ...t,
          panes: filtered,
          activePaneId: t.activePaneId === paneId ? filtered[0].id : t.activePaneId,
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

  nextTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length < 2) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    const next = tabs[(idx + 1) % tabs.length]
    set({ activeTabId: next.id })
  },

  prevTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length < 2) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length]
    set({ activeTabId: prev.id })
  },

  toggleSearch: () => set((state) => ({ searchVisible: !state.searchVisible })),
  setSearchVisible: (visible: boolean) => set({ searchVisible: visible }),
}))
