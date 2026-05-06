import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspaceStore } from './stores/workspace'
import { useAppUpdateStore } from './stores/appUpdate'
import { useGitStore } from './stores/git'
import { useAgentTeamStore } from './stores/agentTeam'
import { useLibraryStore } from './stores/library'

import { Shell } from './components/v2/Shell'
import { WorkspaceV2 } from './components/v2/WorkspaceV2'
import { Library } from './components/v2/Library'
import { SettingsFull } from './components/v2/SettingsFull'
import { Wizard, type WizardResult } from './components/v2/Wizard'
import { CommandPalette, DEFAULT_PALETTE_ITEMS } from './components/v2/CommandPalette'
import { GitPanelWired } from './components/v2/wired/GitPanelWired'
import { DashboardPanelWired } from './components/v2/wired/DashboardPanelWired'
import { NewWorkspaceDialog } from './components/workspace/NewWorkspaceDialog'

import { TEAMS as SEED_TEAMS } from './components/v2/data'
import type { ViewKey, WorkspaceSummary, Team as V2Team, MemberState } from './components/v2/types'

import type { Workspace as WorkspaceModel, Team as StoreTeam, AgentStatus } from '@/types'

/** Map an inbox AgentStatus → the v2 MemberState used by RunLiveView etc. */
function statusToMemberState(status: AgentStatus): MemberState {
  if (status === 'idle') return 'idle'
  if (status === 'shutdown') return 'done'
  return 'active'
}

/**
 * Adapt the watcher-emitted Team (config.json + inbox-derived status) onto the
 * richer v2 Team shape consumed by WorkspaceV2 / TeamsRunSection / RunLiveView.
 * UI-only fields (progress, tokens, durationMin) get sensible placeholders;
 * we'll wire them to real telemetry once it exists.
 */
function toV2Team(team: StoreTeam): V2Team {
  const members = team.members.map((m) => ({
    agentId: m.agentId,
    task: m.task ?? m.lastSummary ?? '',
    state: statusToMemberState(m.status),
    tokens: 0,
    files: 0,
    pane: m.name?.slice(0, 4).toUpperCase() ?? 'PANE',
  }))
  // Aggregate run status: blocked > active > idle > done.
  const runStatus: V2Team['status'] = members.some((m) => m.state === 'blocked')
    ? 'blocked'
    : members.some((m) => m.state === 'active')
      ? 'active'
      : members.every((m) => m.state === 'done')
        ? 'done'
        : 'idle'
  return {
    id: team.id,
    name: team.name,
    goal: team.goal ?? team.description ?? '',
    status: runStatus,
    progress: 0,
    lastActive: '방금 전',
    branch: `team/${team.name.toLowerCase().replace(/\s+/g, '-')}`,
    worktree: team.worktreeStrategy ?? 'isolated',
    merge: team.mergeStrategy ?? 'squash',
    tokens: 0,
    durationMin: Math.max(0, Math.round((Date.now() - team.createdAt) / 60_000)),
    members,
  }
}

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
    // Subscribe to team updates once. setActiveWorkspace handles repointing
    // the watcher; the subscribe callback updates the store as the chokidar
    // watcher emits new configs.
    useAgentTeamStore.getState().subscribe()
    return () => useAgentTeamStore.getState().unsubscribeAll()
  }, [loadWorkspaces])

  // ── Library: hydrate scanner-backed lists when workspace changes ──
  useEffect(() => {
    if (activeWorkspace) {
      void useLibraryStore.getState().loadAll(activeWorkspace.path)
      void useAgentTeamStore.getState().load()
    } else {
      useLibraryStore.getState().reset()
    }
  }, [activeWorkspace])

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

  const onWizardCreate = async (result: WizardResult) => {
    if (!activeWorkspace) {
      // Without a workspace we have nowhere to write the team config — silently
      // close the wizard rather than throwing.
      setWizardOpen(false)
      return
    }
    try {
      await useAgentTeamStore.getState().create({
        workspaceId: activeWorkspace.id,
        workspacePath: activeWorkspace.path,
        name: result.name,
        goal: result.goal,
        members: result.members.map((agentId) => ({ agentId })),
        worktreeStrategy: result.worktree,
        mergeStrategy: result.merge,
      })
      setToast({ name: result.name, count: result.members.length })
    } catch (err) {
      console.error('[wizard] team create failed:', err)
      setToast({ name: 'Failed to create team', count: 0 })
    } finally {
      setWizardOpen(false)
      setTimeout(() => setToast(null), 3000)
    }
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

  // Real teams from the watcher, scoped to the active workspace. When empty,
  // we keep the seed list so the design demo still has something to render.
  const realTeams = useAgentTeamStore((s) => s.teams)
  const runs = useMemo<V2Team[]>(() => {
    const wsTeams = realTeams.filter(
      (t) => !t.workspaceId || t.workspaceId === activeWorkspace?.id,
    )
    if (wsTeams.length === 0) return SEED_TEAMS
    return wsTeams.map(toV2Team)
  }, [realTeams, activeWorkspace])

  // Map current view → main content
  let main: React.ReactNode
  if (view === 'workspace') {
    main = (
      <WorkspaceV2
        workspace={activeSummary}
        runs={runs}
        activeRunId={activeRunId}
        onOpenRun={(id) => setActiveRunId(id)}
        onCloseRun={() => setActiveRunId(null)}
        onNewRun={onNewRun}
        harnessUpdate={!!harnessUpdateAvailable}
      />
    )
  } else if (view === 'git') {
    main = <GitPanelWired />
  } else if (view === 'dashboard') {
    main = <DashboardPanelWired onCmdK={() => setPaletteOpen(true)} />
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
