import { useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { VscClose } from 'react-icons/vsc'

export function NewWorkspaceDialog() {
  const { newWorkspaceDialogVisible, setNewWorkspaceDialog, createWorkspace } = useWorkspaceStore()
  const [name, setName] = useState('')
  const [dirPath, setDirPath] = useState('')
  const [creating, setCreating] = useState(false)

  if (!newWorkspaceDialogVisible) return null

  const handleBrowse = async () => {
    const result = await window.api.system.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select parent directory',
    })
    if (!result.canceled && result.filePaths[0]) {
      setDirPath(result.filePaths[0])
    }
  }

  const handleCreate = async () => {
    if (!name.trim() || !dirPath.trim()) return
    setCreating(true)
    try {
      await createWorkspace(name.trim(), dirPath.trim())
      setName('')
      setDirPath('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-[480px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">New Workspace</h2>
          <button
            className="p-1 hover:bg-surface-2 rounded text-text-muted hover:text-text-primary"
            onClick={() => setNewWorkspaceDialog(false)}
          >
            <VscClose size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              className="w-full bg-surface-0 text-text-primary text-sm px-3 py-2 rounded-lg border border-border focus:border-accent outline-none"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Parent Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
                placeholder="/Users/you/projects"
                className="flex-1 bg-surface-0 text-text-primary text-sm px-3 py-2 rounded-lg border border-border focus:border-accent outline-none"
              />
              <button
                className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-text-primary text-sm rounded-lg border border-border transition-colors"
                onClick={handleBrowse}
              >
                Browse
              </button>
            </div>
          </div>

          <div className="bg-surface-0 rounded-lg p-3 border border-border">
            <div className="text-xs text-text-secondary mb-1">Template includes:</div>
            <div className="text-2xs text-text-muted space-y-0.5">
              <div>CLAUDE.md + .claude/ (agents, skills, commands, hooks, rules, scripts)</div>
              <div>18 agents, 22 skills, 26 commands, 10 scripts, 15 MCP servers</div>
              <div>Auto: TDD, verification, review, docs, checkpoint, learning</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-2 transition-colors"
            onClick={() => setNewWorkspaceDialog(false)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
            onClick={handleCreate}
            disabled={!name.trim() || !dirPath.trim() || creating}
          >
            {creating ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  )
}
