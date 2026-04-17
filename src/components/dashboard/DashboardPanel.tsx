import { useState, useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { VscClose, VscExtensions, VscSymbolMethod, VscServer, VscShield, VscFile, VscRefresh } from 'react-icons/vsc'

type DashTab = 'agents' | 'skills' | 'commands' | 'mcp' | 'scripts'

const DASH_TABS: { id: DashTab; label: string; icon: typeof VscExtensions }[] = [
  { id: 'agents', label: 'Agents', icon: VscExtensions },
  { id: 'skills', label: 'Skills', icon: VscShield },
  { id: 'commands', label: 'Commands', icon: VscSymbolMethod },
  { id: 'mcp', label: 'MCP', icon: VscServer },
  { id: 'scripts', label: 'Scripts', icon: VscFile },
]

export function DashboardPanel() {
  const { dashboardVisible, toggleDashboard, harnessInfo, mcpStatus, scanHarness, scanMcp } = useWorkspaceStore()
  const [activeTab, setActiveTab] = useState<DashTab>('agents')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')

  useEffect(() => {
    if (selectedFile) {
      window.api.harness.readFile(selectedFile).then(setFileContent)
    }
  }, [selectedFile])

  if (!dashboardVisible || !harnessInfo) return null

  const renderList = () => {
    let items: { name: string; file: string }[] = []
    switch (activeTab) {
      case 'agents': items = harnessInfo.agents; break
      case 'skills': items = harnessInfo.skills; break
      case 'commands': items = harnessInfo.commands; break
      case 'scripts': items = harnessInfo.scripts; break
      case 'mcp':
        return (
          <div className="flex flex-col">
            {mcpStatus.map((mcp) => (
              <div key={mcp.name} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-2 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  mcp.status === 'available' || mcp.status === 'http' ? 'bg-status-success' : 'bg-status-error'
                }`} />
                <span className="font-medium text-text-primary flex-1">{mcp.name}</span>
                <span className="text-text-muted font-mono">{mcp.status}</span>
                {mcp.command && <span className="text-text-muted truncate max-w-40">{mcp.command}</span>}
              </div>
            ))}
          </div>
        )
    }

    return (
      <div className="flex flex-col">
        {items.map((item) => (
          <button
            key={item.name}
            className={`flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
              selectedFile === item.file ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
            }`}
            onClick={() => setSelectedFile(selectedFile === item.file ? null : item.file)}
          >
            <span className="font-medium">{item.name}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col w-80 bg-surface-1 border-l border-border h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Harness Dashboard</span>
        <div className="flex items-center gap-1">
          <button
            className="p-1 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary"
            onClick={() => { scanHarness(); scanMcp() }}
            title="Refresh"
          >
            <VscRefresh size={14} />
          </button>
          <button
            className="p-1 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary"
            onClick={toggleDashboard}
          >
            <VscClose size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {DASH_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`flex items-center gap-1 px-3 py-2 text-xs transition-colors whitespace-nowrap ${
              activeTab === id
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
            onClick={() => { setActiveTab(id); setSelectedFile(null) }}
          >
            <Icon size={12} />
            {label}
            <span className="text-2xs text-text-muted ml-0.5">
              {id === 'agents' ? harnessInfo.agents.length :
               id === 'skills' ? harnessInfo.skills.length :
               id === 'commands' ? harnessInfo.commands.length :
               id === 'mcp' ? harnessInfo.mcpServers.length :
               harnessInfo.scripts.length}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {renderList()}
      </div>

      {/* File preview */}
      {selectedFile && fileContent && (
        <div className="border-t border-border max-h-60 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2">
            <span className="text-2xs text-text-muted truncate">{selectedFile.split('/').pop()}</span>
            <button
              className="p-0.5 hover:bg-surface-3 rounded"
              onClick={() => setSelectedFile(null)}
            >
              <VscClose size={12} />
            </button>
          </div>
          <pre className="p-3 text-2xs text-text-secondary font-mono whitespace-pre-wrap break-all">
            {fileContent.slice(0, 2000)}
            {fileContent.length > 2000 && '\n\n... (truncated)'}
          </pre>
        </div>
      )}
    </div>
  )
}
