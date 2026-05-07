import { useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { VscClose } from 'react-icons/vsc'

export function NewWorkspaceDialog() {
  const { newWorkspaceDialogVisible, setNewWorkspaceDialog, createWorkspace } = useWorkspaceStore()
  const [name, setName] = useState('')
  const [dirPath, setDirPath] = useState('')
  const [creating, setCreating] = useState(false)
  // Split-repo: register origin-client/server/cms remotes on the new monorepo
  // so the user can `git subtree push` each stack to its own GitHub repo.
  const [splitRepos, setSplitRepos] = useState(false)
  const [owner, setOwner] = useState('')
  const [baseName, setBaseName] = useState('')
  const [autoCreateRepos, setAutoCreateRepos] = useState(false)
  // code-review-graph: opt-in auto build right after scaffolding. Requires the
  // CLI to be installed (Settings → MCP / Tools panel handles install).
  const [crGraphAutoBuild, setCrGraphAutoBuild] = useState(false)

  if (!newWorkspaceDialogVisible) return null

  // Effective base name: explicit input wins, otherwise fall back to the
  // project folder name. Mirrors what WorkspaceManager will see.
  const effectiveBaseName = (baseName.trim() || name.trim()).toLowerCase()
  const effectiveOwner = owner.trim() || '<your-gh-login>'

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
      await createWorkspace(
        name.trim(),
        dirPath.trim(),
        splitRepos
          ? {
              enabled: true,
              baseName: effectiveBaseName,
              owner: owner.trim() || undefined,
              protocol: 'ssh',
              autoCreateRepos,
            }
          : undefined,
        crGraphAutoBuild ? { autoBuild: true } : undefined
      )
      setName('')
      setDirPath('')
      setSplitRepos(false)
      setOwner('')
      setBaseName('')
      setAutoCreateRepos(false)
      setCrGraphAutoBuild(false)
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

          <div className="bg-surface-0 rounded-lg p-3 border border-border">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={splitRepos}
                onChange={(e) => setSplitRepos(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span className="text-xs text-text-primary">
                Split remote repos by stack (GitHub)
              </span>
            </label>

            {splitRepos && (
              <div className="mt-3 flex flex-col gap-2.5">
                <div>
                  <label className="text-2xs text-text-secondary mb-1 block">
                    GitHub owner (leave empty to auto-detect via gh CLI)
                  </label>
                  <input
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="mstagon"
                    className="w-full bg-surface-1 text-text-primary text-xs px-2.5 py-1.5 rounded-md border border-border focus:border-accent outline-none"
                  />
                </div>

                <div>
                  <label className="text-2xs text-text-secondary mb-1 block">
                    Base name (defaults to project name)
                  </label>
                  <input
                    type="text"
                    value={baseName}
                    onChange={(e) => setBaseName(e.target.value)}
                    placeholder={name.trim() || 'my-project'}
                    className="w-full bg-surface-1 text-text-primary text-xs px-2.5 py-1.5 rounded-md border border-border focus:border-accent outline-none"
                  />
                </div>

                <div className="bg-surface-1 rounded-md px-2.5 py-2 border border-border">
                  <div className="text-2xs text-text-secondary mb-1">Will register remotes:</div>
                  <div className="text-2xs text-text-muted font-mono space-y-0.5">
                    <div>
                      origin-client → {effectiveOwner}/{effectiveBaseName || '<base>'}-client
                    </div>
                    <div>
                      origin-server → {effectiveOwner}/{effectiveBaseName || '<base>'}-server
                    </div>
                    <div>
                      origin-cms → {effectiveOwner}/{effectiveBaseName || '<base>'}-cms
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCreateRepos}
                    onChange={(e) => setAutoCreateRepos(e.target.checked)}
                    className="w-3.5 h-3.5 accent-accent"
                  />
                  <span className="text-2xs text-text-secondary">
                    Also create empty private repos via gh CLI (best-effort)
                  </span>
                </label>

                <div className="text-2xs text-text-muted leading-relaxed">
                  Note: GitHub repos must already exist (or use the option above). Subtree push is
                  not run automatically — use{' '}
                  <span className="font-mono">git subtree push --prefix=client origin-client …</span>{' '}
                  when ready.
                </div>
              </div>
            )}
          </div>

          {/* Advanced options: code-review-graph build (opt-in) */}
          <div className="bg-surface-0 rounded-lg p-3 border border-border">
            <div className="text-xs text-text-secondary mb-2">Advanced</div>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={crGraphAutoBuild}
                onChange={(e) => setCrGraphAutoBuild(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 accent-accent"
              />
              <span className="flex-1">
                <span className="block text-xs text-text-primary">
                  코드 리뷰 그래프 빌드 (code-review-graph)
                </span>
                <span className="block text-2xs text-text-muted leading-relaxed mt-0.5">
                  <span className="font-mono">pipx install code-review-graph</span>{' '}
                  가 미리 깔려 있어야 합니다 (Settings 에서 확인).
                </span>
              </span>
            </label>
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
