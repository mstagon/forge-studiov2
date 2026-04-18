import { useState, useEffect, useRef, useMemo } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTerminalStore } from '@/stores/terminal'
import { VscTerminal, VscExtensions, VscSymbolMethod, VscServer } from 'react-icons/vsc'

interface PaletteItem {
  id: string
  label: string
  category: string
  icon: typeof VscTerminal
  action: () => void
}

export function CommandPalette() {
  const { commandPaletteVisible, toggleCommandPalette, harnessInfo, activeWorkspace } = useWorkspaceStore()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = []

    // Commands
    if (harnessInfo) {
      for (const cmd of harnessInfo.commands) {
        list.push({
          id: `cmd:${cmd.name}`,
          label: `/${cmd.name}`,
          category: 'Command',
          icon: VscSymbolMethod,
          action: () => {
            // Type the command into the active terminal
            const store = useTerminalStore.getState()
            const tab = store.tabs.find((t) => t.id === store.activeTabId)
            if (tab) {
              const pane = tab.panes.find((p) => p.id === tab.activePaneId)
              if (pane?.ptyId) {
                window.api.pty.write(pane.ptyId, `/${cmd.name}\n`)
              }
            }
            toggleCommandPalette()
          },
        })
      }

      // Agents
      for (const agent of harnessInfo.agents) {
        list.push({
          id: `agent:${agent.name}`,
          label: agent.name,
          category: 'Agent',
          icon: VscExtensions,
          action: async () => {
            // Type agent name into active terminal for quick reference
            const store = useTerminalStore.getState()
            const tab = store.tabs.find((t) => t.id === store.activeTabId)
            if (tab) {
              const pane = tab.panes.find((p) => p.id === tab.activePaneId)
              if (pane?.ptyId) {
                window.api.pty.write(pane.ptyId, `# Agent: ${agent.name}\n`)
              }
            }
            toggleCommandPalette()
          },
        })
      }

      // MCP Servers
      for (const mcp of harnessInfo.mcpServers) {
        list.push({
          id: `mcp:${mcp.name}`,
          label: mcp.name,
          category: 'MCP Server',
          icon: VscServer,
          action: () => toggleCommandPalette(),
        })
      }
    }

    // Built-in actions
    list.push({
      id: 'action:new-tab',
      label: 'New Terminal Tab',
      category: 'Action',
      icon: VscTerminal,
      action: () => {
        useTerminalStore.getState().addTab(activeWorkspace?.path, activeWorkspace?.id)
        toggleCommandPalette()
      },
    })

    return list
  }, [harnessInfo, activeWorkspace, toggleCommandPalette])

  const filtered = useMemo(() => {
    if (!query) return items
    const lower = query.toLowerCase()
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower)
    )
  }, [items, query])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  useEffect(() => {
    if (commandPaletteVisible) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteVisible])

  if (!commandPaletteVisible) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      filtered[selectedIdx].action()
    } else if (e.key === 'Escape') {
      toggleCommandPalette()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/30"
      onClick={toggleCommandPalette}
    >
      <div
        className="bg-surface-1 border border-border rounded-xl shadow-2xl w-[560px] max-h-[480px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, agent, or action..."
            className="w-full bg-transparent text-text-primary text-sm outline-none placeholder:text-text-muted"
          />
        </div>
        <div className="overflow-y-auto max-h-[400px]">
          {filtered.map((item, idx) => {
            const Icon = item.icon
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                  idx === selectedIdx ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-2'
                }`}
                onClick={item.action}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <Icon size={16} className="shrink-0" />
                <span className="flex-1 text-sm">{item.label}</span>
                <span className="text-2xs text-text-muted">{item.category}</span>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              No results
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
