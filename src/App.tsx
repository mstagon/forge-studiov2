import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspaceStore } from './stores/workspace'
import { useAppUpdateStore } from './stores/appUpdate'
import { useGitStore } from './stores/git'

import { Shell } from './components/v2/Shell'
import { WorkspaceV2 } from './components/v2/WorkspaceV2'
import { Library } from './components/v2/Library'
import { SettingsFull } from './components/v2/SettingsFull'
import { Wizard } from './components/v2/Wizard'
import { CommandPalette, DEFAULT_PALETTE_ITEMS } from './components/v2/CommandPalette'
import { GitPanel, DashboardPanel } from './components/v2/Placeholders'
import { NewWorkspaceDialog } from './components/workspace/NewWorkspaceDialog'

import { TEAMS as SEED_TEAMS } from './components/v2/data'
import type { ViewKey, WorkspaceSummary } from './components/v2/types'

import type { Workspace as WorkspaceModel } from '@/types'

/**
 * Map the persisted Workspace model (id/name/path/createdAt/lastOpened) to the
 * v2 chrome's WorkspaceSummary (id/name/path/branch/harness). Branch/harness
 * are pulled from the live workspace store when available; otherwise we show
 * sensible placeholders so the chrome never breaks.
 */
function toSummary(
  ws: WorkspaceModel,
  branch: string | null,
  installedHarness: string | null,
  isCurrent: boolean,
): WorkspaceSummary {
  return {
    id: ws.id,
    name: ws.name,
    path: ws.path,
    branch: branch ?? '—',
    harness: installedHarness ?? (ws.harnessApplied ? '✓' : '—'),
    current: isCurrent || undefined,
  }
}

export default function App() {
  const {
    activeWorkspace,
    workspaces,
    loadWorkspaces,
    setActiveWorkspace,
    openWorkspace,
    setNewWorkspaceDialog,
    installedHarnessVersion,
    bundledHarnessVersion,
    updateHarness,
    harnessUpdating,
  } = useWorkspaceStore()

  const branch = useGitStore((s) => s.status?.branch ?? null)

  // ── View routing ────────────────────────────────────────────────
  const [view, setView] = useState<ViewKey>('workspace')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<{ name: string; count: number } | null>(null)
  const [model] = useState({ id: 'sonnet-4.5', label: 'sonnet-4.5' })

  // ── Boot ────────────────────────────────────────────────────────
  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  useEffect(() => {
    const checkUpdates = useAppUpdateStore.getState().check
    checkUpdates()
    const id = setInterval(checkUpdates, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // ── Workspace summaries for the switcher / settings ────────────
  const workspaceSummaries = useMemo<WorkspaceSummary[]>(
    () =>
      workspaces.map((w) =>
        toSummary(
          w,
          activeWorkspace?.id === w.id ? branch : null,
          activeWorkspace?.id === w.id ? installedHarnessVersion : null,
          activeWorkspace?.id === w.id,
        ),
      ),
    [workspaces, activeWorkspace, branch, installedHarnessVersion],
  )

  const activeSummary = useMemo<WorkspaceSummary | null>(() => {
    if (!activeWorkspace) return null
    return toSummary(activeWorkspace, branch, installedHarnessVersion, true)
  }, [activeWorkspace, branch, installedHarnessVersion])

  // ── IPC + native menu actions (preserved from v1) ───────────────
  useEffect(() => {
    const cleanups = [
      window.api.on('action', (action: string) => {
        switch (action) {
          case 'new-workspace':
            setNewWorkspaceDialog(true)
            break
          case 'command-palette':
            setPaletteOpen((v) => !v)
            break
        }
      }),
      window.api.on('workspace-opened', (dirPath: string) => {
        openWorkspace(dirPath)
      }),
      window.api.on('navigate', (target: string) => {
        if (target === 'settings') setView('settings')
      }),
    ]
    return () => cleanups.forEach((c) => c())
  }, [openWorkspace, setNewWorkspaceDialog])

  // ── Global keyboard shortcut: Cmd+Shift+. → harness file toggle ─
  // (Shell handles ⌘1..⌘4 / ⌘N / ⌘K / ⌘, / Esc internally.)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey
    if (
      meta &&
      e.shiftKey &&
      (e.key === '.' || e.key === '>' || e.code === 'Period')
    ) {
      e.preventDefault()
      useGitStore.getState().toggleHarnessFiles()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ── Run + palette wiring ────────────────────────────────────────
  const onSwitchWorkspace = (id: string) => {
    const ws = workspaces.find((w) => w.id === id)
    if (ws) setActiveWorkspace(ws)
  }

  const onNewRun = () => {
    setWizardOpen(true)
  }

  const onApplyComposition = (comp: { name: string; members?: unknown[] }) => {
    const memberCount = Array.isArray(comp.members) ? comp.members.length : 1
    setToast({ name: comp.name, count: memberCount })
    setTimeout(() => setToast(null), 4000)
    setWizardOpen(true)
  }

  const onWizardCreate = () => {
    setWizardOpen(false)
    setToast({ name: 'New run', count: 1 })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Render ──────────────────────────────────────────────────────
  if (!activeSummary) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--bg-1)',
          color: 'var(--text-2)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 12, color: 'var(--text-1)', fontSize: 16, fontWeight: 600 }}>
            Forge Studio
          </div>
          <button
            onClick={() => setNewWorkspaceDialog(true)}
            style={{
              background: 'var(--accent)',
              color: '#0b0e13',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            새 워크스페이스 만들기
          </button>
        </div>
        <NewWorkspaceDialog />
      </div>
    )
  }

  const harnessUpdateAvailable =
    installedHarnessVersion &&
    bundledHarnessVersion &&
    installedHarnessVersion !== bundledHarnessVersion

  // Map current view → main content
  let main: React.ReactNode
  if (view === 'workspace') {
    main = (
      <WorkspaceV2
        workspace={activeSummary}
        runs={SEED_TEAMS}
        activeRunId={activeRunId}
        onOpenRun={(id) => setActiveRunId(id)}
        onCloseRun={() => setActiveRunId(null)}
        onNewRun={onNewRun}
        harnessUpdate={!!harnessUpdateAvailable}
      />
    )
  } else if (view === 'git') {
    main = <GitPanel />
  } else if (view === 'dashboard') {
    main = <DashboardPanel onCmdK={() => setPaletteOpen(true)} />
  } else if (view === 'library') {
    main = (
      <Library
        workspace={activeSummary}
        onApplyComposition={onApplyComposition}
      />
    )
  } else if (view === 'settings') {
    main = <SettingsFull workspaces={workspaceSummaries} workspace={activeSummary} />
  }

  return (
    <>
      <Shell
        workspace={activeSummary}
        workspaces={workspaceSummaries}
        view={view}
        onView={setView}
        onSwitchWorkspace={onSwitchWorkspace}
        onCmdK={() => setPaletteOpen(true)}
        onNewRun={onNewRun}
        onCloseRun={activeRunId ? () => setActiveRunId(null) : undefined}
        onOpenSettings={() => setView('settings')}
        onAddWorkspace={() => setNewWorkspaceDialog(true)}
        topBar={{ model: model.label }}
        harnessBanner={
          harnessUpdateAvailable
            ? {
                fromVersion: installedHarnessVersion!,
                toVersion: bundledHarnessVersion!,
                onUpdate: () => {
                  void updateHarness()
                },
                updating: harnessUpdating,
              }
            : null
        }
        toast={toast}
      >
        {main}
      </Shell>

      <Wizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreate={onWizardCreate}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={DEFAULT_PALETTE_ITEMS}
        onAction={(action) => {
          setPaletteOpen(false)
          // Map common palette actions to existing handlers.
          if (action === 'new-run') onNewRun()
          else if (action === 'new-workspace') setNewWorkspaceDialog(true)
          else if (action === 'open-settings') setView('settings')
          else if (action === 'view-workspace') setView('workspace')
          else if (action === 'view-git') setView('git')
          else if (action === 'view-dashboard') setView('dashboard')
          else if (action === 'view-library') setView('library')
        }}
      />

      <NewWorkspaceDialog />
    </>
  )
}
