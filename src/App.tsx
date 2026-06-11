import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspaceStore } from './stores/workspace'
import { useAppUpdateStore } from './stores/appUpdate'
import { useGitStore } from './stores/git'
import { useAgentTeamStore } from './stores/agentTeam'
import { subscribeToMainErrors } from './stores/errorLog'
import { useModelPolicyStore } from './stores/modelPolicy'

import { Shell } from './components/v2/Shell'
import { LiveTerminalsRoot } from './components/v2/LiveTerminalsRoot'
import { useLiveTerminalsStore } from './stores/liveTerminals'
import { WorkspaceV2 } from './components/v2/WorkspaceV2'
import { SettingsFull } from './components/v2/SettingsFull'
import { Wizard, type WizardResult } from './components/v2/Wizard'
import { CommandPalette, DEFAULT_PALETTE_ITEMS } from './components/v2/CommandPalette'
import { GitPanelWired } from './components/v2/wired/GitPanelWired'
import { DashboardPanelWired } from './components/v2/wired/DashboardPanelWired'
import { NewWorkspaceDialog } from './components/workspace/NewWorkspaceDialog'
import { Onboarding } from './components/v2/Onboarding'
import { HarnessUpdatePreview } from './components/v2/HarnessUpdatePreview'

import { TEAMS as SEED_TEAMS } from './components/v2/data'
import type { ViewKey, WorkspaceSummary, Team as V2Team, MemberState } from './components/v2/types'

import type { Workspace as WorkspaceModel, Team as StoreTeam, AgentStatus } from '@/types'

/** Map an inbox AgentStatus → the v2 MemberState used by RunLiveView etc. */
function statusToMemberState(status: AgentStatus): MemberState {
  if (status === 'paused') return 'paused'
  if (status === 'idle') return 'idle'
  if (status === 'shutdown') return 'done'
  return 'active'
}

/**
 * Adapt the watcher-emitted Team (config.json + inbox-derived status) onto the
 * richer v2 Team shape consumed by WorkspaceV2 / TeamsRunSection / RunLiveView.
 *
 * State precedence (most → least authoritative):
 *   1. team.status === 'paused'              → every member becomes 'paused'
 *   2. member.state (lifecycle, set by pause/resume backend) === 'idle'
 *      → 'paused'  (the watcher's RawMember.state field semantically means
 *        "explicitly paused" after pauseMember(); distinct from inbox idle)
 *   3. inbox-derived AgentStatus              → fallback via statusToMemberState
 *
 * Without precedence #1 + #2, Pause backend changes are invisible to the UI:
 * the inbox stays at the pre-pause activity, RunLiveView keeps showing
 * 'active', and the Pause button never flips to Resume.
 */
function toV2Team(team: StoreTeam): V2Team {
  const teamPaused = team.status === 'paused'
  const members = team.members.map((m) => {
    let state: MemberState
    if (teamPaused) {
      state = 'paused'
    } else if (m.state === 'idle') {
      state = 'paused'
    } else if (m.state === 'active') {
      // Backend says active but inbox might still be reporting idle/shutdown —
      // trust inbox for blocked/done/idle differentiation but never over-claim
      // 'paused' once the lifecycle has been resumed.
      state = statusToMemberState(m.status)
      if (state === 'paused') state = 'active'
    } else {
      state = statusToMemberState(m.status)
    }
    return {
      agentId: m.agentId,
      task: m.task ?? m.lastSummary ?? '',
      state,
      tokens: 0,
      files: 0,
      pane: m.name?.slice(0, 4).toUpperCase() ?? 'PANE',
      name: m.name,
      tmuxPaneId: m.tmuxPaneId,
      unreadCount: m.unreadCount,
      model: m.model,
    }
  })
  // Aggregate run status: team.status === 'done' > paused (team) > blocked >
  // active > paused (members) > idle > done.
  //
  // Codex 적대 검수 (medium #5) fix: 신규 team-level 'done' (forge-team
  // complete / 모든 멤버 complete-member 후 자동 transition) 이 멤버 state
  // 와 무관하게 최상위로 반영돼야 함. 이전 버전은 'paused' 만 team-level 로
  // 처리하고 'done' 은 무시 → 완료된 팀이 UI 에서 계속 active 로 표시.
  const teamDone = team.status === 'done'
  const runStatus: V2Team['status'] = teamDone
    ? 'done'
    : teamPaused
      ? 'paused'
      : members.some((m) => m.state === 'blocked')
        ? 'blocked'
        : members.some((m) => m.state === 'active')
          ? 'active'
          : members.every((m) => m.state === 'done')
            ? 'done'
            : members.length > 0 && members.every((m) => m.state === 'paused' || m.state === 'done')
              ? 'paused'
              : 'idle'
  // 완료된 팀이면 멤버 상태도 시각적으로 done 으로 통일 (status bar 의
  // active agents 집계에서 active 로 세지 않게).
  if (teamDone) {
    for (const m of members) {
      if (m.state !== 'paused') m.state = 'done'
    }
  }
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
    council: (team as StoreTeam & { council?: boolean }).council === true,
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
  const [wizardPrefill, setWizardPrefill] = useState<string[] | undefined>(undefined)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<{ name: string; count: number } | null>(null)
  // TopBar 의 모델 라벨 — modelPolicy store 의 'Other' 역할 default 표시.
  // 사용자가 Settings 에서 변경하면 즉시 갱신. 클릭 시 Settings 의 Agents
  // 섹션으로 이동 — Agent별 + 역할별 매핑 UI.
  const topBarModel = useModelPolicyStore((s) => s.byRole.Other)
  const model = useMemo(() => ({ id: topBarModel, label: topBarModel }), [topBarModel])
  // Harness update preview modal — opened from the orange HarnessBanner's
  // "diff 보기" button. Renders the file tree + per-file unified diff.
  const [updatePreviewOpen, setUpdatePreviewOpen] = useState(false)

  // ── Boot — load workspaces + auto-activate most recently opened ──
  useEffect(() => {
    void (async () => {
      await loadWorkspaces()
      const state = useWorkspaceStore.getState()
      if (!state.activeWorkspace && state.workspaces.length > 0) {
        const recent = [...state.workspaces].sort((a, b) => {
          const aT = +new Date(a.lastOpened ?? a.createdAt ?? 0)
          const bT = +new Date(b.lastOpened ?? b.createdAt ?? 0)
          return bT - aT
        })[0]
        if (recent) state.setActiveWorkspace(recent)
      }
    })()
    // Subscribe to team updates once. setActiveWorkspace handles repointing
    // the watcher; the subscribe callback updates the store as the chokidar
    // watcher emits new configs.
    useAgentTeamStore.getState().subscribe()
    return () => useAgentTeamStore.getState().unsubscribeAll()
  }, [loadWorkspaces])

  // ── Teams: reload when workspace changes ──
  useEffect(() => {
    if (activeWorkspace) {
      void useAgentTeamStore.getState().load()
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
      // Pipe main-process errors into the in-app log so the Settings →
      // Error Log view can show them without each component subscribing
      // individually. The handler ignores its return when the bridge is
      // missing (older dev builds).
      subscribeToMainErrors(),
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

  // ── Dashboard quick action bus ──────────────────────────────────
  // DashboardPanel emits CustomEvent('forge:*') to request app-level actions
  // since the panel itself doesn't own the wizard / sidebar / dialog state.
  useEffect(() => {
    const handleNewRun = (e: Event) => {
      const detail = (e as CustomEvent<{ prefillMembers?: string[] }>).detail
      // 호출자가 prefillMembers 를 넘기면 그 멤버가 미리 선택된 상태로 위저드
      // 가 열린다. Dashboard 의 "새 팀 만들기" 는 detail 없이 emit → undefined.
      setWizardPrefill(
        detail?.prefillMembers && detail.prefillMembers.length > 0
          ? detail.prefillMembers
          : undefined,
      )
      setWizardOpen(true)
    }
    const handleOpenFolder = (e: Event) => {
      const detail = (e as CustomEvent<{ path: string }>).detail
      if (detail?.path) void openWorkspace(detail.path)
    }
    const handleNavSettings = (e: Event) => {
      setView('settings')
      const detail = (e as CustomEvent<{ section?: string; card?: string }>).detail
      if (detail) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('forge:settings-target', { detail }))
        }, 50)
      }
    }
    window.addEventListener('forge:new-run', handleNewRun)
    window.addEventListener('forge:open-folder', handleOpenFolder)
    window.addEventListener('forge:nav-settings', handleNavSettings)
    return () => {
      window.removeEventListener('forge:new-run', handleNewRun)
      window.removeEventListener('forge:open-folder', handleOpenFolder)
      window.removeEventListener('forge:nav-settings', handleNavSettings)
    }
  }, [openWorkspace])

  // ── Run + palette wiring ────────────────────────────────────────
  const onSwitchWorkspace = (id: string) => {
    const ws = workspaces.find((w) => w.id === id)
    if (ws) {
      // Tear down live terminals from the previous workspace so we don't
      // keep dangling PTYs attached to teams the user can't see anymore.
      useLiveTerminalsStore.getState().clear()
      setActiveWorkspace(ws)
    }
  }

  const onNewRun = () => {
    setWizardPrefill(undefined)
    setWizardOpen(true)
  }

  const onOnboardingSampleRun = () => {
    // 3 members chosen to mirror the "default agent set" surfaced in
    // Settings → Agents (front-end + backend + reviewer is the most common
    // shape for first-run flows). The wizard still shows step 1 first so
    // the user can refine the goal before launching.
    setWizardPrefill(['flutter-ui', 'nestjs-backend', 'code-reviewer'])
    setWizardOpen(true)
  }

  /**
   * Map an agent id to its model. Settings → "역할별 모델" + "에이전트별
   * override" 가 사용자 정책의 source of truth. 사용자가 명시 안 한
   * 항목은 store 의 default (GPT 강점 = Database / 그 외 Opus).
   */
  function defaultModelFor(agentId: string): string {
    return useModelPolicyStore.getState().resolveModel(agentId)
  }

  const onWizardCreate = async (result: WizardResult) => {
    if (!activeWorkspace) {
      // Without a workspace we have nowhere to write the team config — silently
      // close the wizard rather than throwing.
      setWizardOpen(false)
      return
    }
    try {
      const created = await useAgentTeamStore.getState().create({
        workspaceId: activeWorkspace.id,
        workspacePath: activeWorkspace.path,
        name: result.name,
        goal: result.goal,
        // 각 멤버의 model 매핑: 사용자가 Wizard 에서 명시 선택 → memberModels[agentId],
        // 미선택 → defaultModelFor(agentId) 자동 매핑 (roadmap "에이전트별 추천 모델").
        members: result.members.map((agentId) => ({
          agentId,
          model: result.memberModels?.[agentId] || defaultModelFor(agentId),
        })),
        worktreeStrategy: result.worktree,
        mergeStrategy: result.merge,
        council: result.council,
      })
      // When W1's create() returns enriched stats (worktreesCreated /
      // tmuxSessionsStarted > 0), append them to the toast name so the
      // user gets immediate feedback that the orchestration kicked in.
      const memberCount = result.members.length
      const extras: string[] = [`${memberCount} members`]
      if (created.worktreesCreated > 0) {
        extras.push(`${created.worktreesCreated} worktrees`)
      }
      if (created.tmuxSessionsStarted > 0) {
        extras.push(`${created.tmuxSessionsStarted} tmux 세션`)
      }
      const decoratedName =
        extras.length > 1 ? `${result.name} (${extras.join(' · ')})` : result.name
      setToast({ name: decoratedName, count: memberCount })
    } catch (err) {
      console.error('[wizard] team create failed:', err)
      const message = err instanceof Error ? err.message : 'Failed to create team'
      setToast({ name: `팀 생성 실패: ${message}`, count: 0 })
    } finally {
      setWizardOpen(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  // Real teams from the watcher, scoped to the active workspace.
  // No seed fallback — empty workspace gets an empty Teams section, not fake
  // "회원가입 피처팀" cards. Lying to the user is worse than an empty list.
  // NOTE: hoisted ABOVE the early-return below so React's hook order stays
  // stable whether or not a workspace is active. Otherwise the workspace-
  // empty boot path returns 26 hooks and the post-boot path returns 27,
  // tripping "Rendered more hooks than during the previous render".
  const realTeams = useAgentTeamStore((s) => s.teams)
  const runs = useMemo<V2Team[]>(() => {
    // 매칭 룰 (path > id > name 우선):
    // 1. workspacePath 가 있으면 활성 워크스페이스 path 와 일치
    // 2. 아니면 workspaceId 가 활성 워크스페이스 id 와 일치
    // 3. 아니면 workspaceId 가 활성 워크스페이스 name 과 일치 (forge-team CLI
    //    default — basename 사용)
    // 4. workspaceId 도 없으면 (legacy / global) 무조건 표시
    //
    // NFC 정규화: macOS APFS path API 는 NFD (분해형 자모) 반환 — electron
    // showOpenDialog 도 NFD 저장. 반면 forge-team CLI 가 받는 workspacePath
    // 는 NFC (완성형) 가능. 같은 `/Users/macms/마블워크-mvpv1` 디렉토리지만
    // 문자열 인코딩이 달라 === 실패 → 사용자 "팀 안 뜬다" 결함의 진짜 원인.
    const normalize = (s: string | undefined): string => (s ? s.normalize('NFC') : '')
    const wsPath = normalize(activeWorkspace?.path)
    const wsId = activeWorkspace?.id
    const wsName = activeWorkspace?.name
    return realTeams
      .filter((t) => {
        // archive 된 팀은 history — worktree/tmux 가 이미 정리돼 터미널 뷰가
        // 무의미하다. 활성 목록에서 제외 (v0.13.0 팀 자동 정리).
        if (t.archivedAt) return false
        if (!activeWorkspace) return !t.workspaceId
        if (t.workspacePath) return normalize(t.workspacePath) === wsPath
        if (t.workspaceId) {
          return t.workspaceId === wsId || t.workspaceId === wsName
        }
        return true
      })
      .map(toV2Team)
  }, [realTeams, activeWorkspace])

  const harnessUpdateAvailable =
    installedHarnessVersion &&
    bundledHarnessVersion &&
    installedHarnessVersion !== bundledHarnessVersion

  // ── Render ──────────────────────────────────────────────────────
  if (!activeSummary) {
    const recentList = [...workspaces].sort((a, b) => {
      const aT = +new Date(a.lastOpened ?? a.createdAt ?? 0)
      const bT = +new Date(b.lastOpened ?? b.createdAt ?? 0)
      return bT - aT
    })
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
        <div style={{ width: 480, maxWidth: '90%' }}>
          <div
            style={{
              textAlign: 'center',
              marginBottom: 28,
              color: 'var(--text-1)',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.3px',
            }}
          >
            Forge Studio
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: recentList.length > 0 ? 28 : 0 }}>
            <button
              onClick={() => setNewWorkspaceDialog(true)}
              style={{
                flex: 1,
                background: 'var(--accent)',
                color: '#0b0e13',
                border: 'none',
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              + 새 워크스페이스
            </button>
            <button
              onClick={async () => {
                const result = await window.api.system.showOpenDialog({
                  properties: ['openDirectory', 'createDirectory'],
                  title: '기존 폴더 열기',
                })
                if (result && !result.canceled && result.filePaths[0]) {
                  await openWorkspace(result.filePaths[0])
                }
              }}
              style={{
                flex: 1,
                background: 'var(--bg-3)',
                color: 'var(--text-1)',
                border: '1px solid var(--line-2)',
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              📁 기존 폴더 열기
            </button>
          </div>

          {/* Recent workspaces */}
          {recentList.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: 8,
                }}
              >
                Recent workspaces
              </div>
              <div
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                {recentList.slice(0, 6).map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => useWorkspaceStore.getState().setActiveWorkspace(ws)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      width: '100%',
                      padding: '10px 14px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--line-1)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: 'var(--text-1)',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-3)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{ws.name}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-3)',
                        fontFamily: 'var(--font-mono)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}
                    >
                      {ws.path}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <NewWorkspaceDialog />
        {/* Onboarding overlays the empty state on first run so brand-new users
            don't see only a single button — they get the full 5-step tour. */}
        <Onboarding onSampleRun={onOnboardingSampleRun} />
      </div>
    )
  }

  // Map current view → main content.
  //
  // WorkspaceV2 stays mounted across view changes (display toggled via the
  // wrapper below). Otherwise navigating to Library/Settings/Git tears down
  // TerminalAreaV2 + its private SlotRegistry + every <XTerminal>, killing
  // the user's `claude` shell and resetting the viewport on return — exactly
  // the "다른 화면 갔다오면 터미널 초기화" regression we kept missing.
  // Other views (git/dashboard/library/settings) stay conditional because
  // they don't host live PTYs.
  const workspaceVisible = view === 'workspace'
  const workspaceNode = (
    <div
      style={{
        display: workspaceVisible ? 'flex' : 'none',
        flex: 1,
        minHeight: 0,
        flexDirection: 'column',
      }}
    >
      <WorkspaceV2
        workspace={activeSummary}
        runs={runs}
        activeRunId={activeRunId}
        onOpenRun={(id) => setActiveRunId(id)}
        onCloseRun={() => setActiveRunId(null)}
        onNewRun={onNewRun}
        harnessUpdate={!!harnessUpdateAvailable}
      />
    </div>
  )

  let secondaryView: React.ReactNode = null
  if (view === 'git') {
    secondaryView = <GitPanelWired />
  } else if (view === 'dashboard') {
    secondaryView = <DashboardPanelWired onCmdK={() => setPaletteOpen(true)} />
  } else if (view === 'settings') {
    secondaryView = <SettingsFull workspaces={workspaceSummaries} workspace={activeSummary} />
  }

  const main = (
    <>
      {workspaceNode}
      {secondaryView}
    </>
  )

  return (
    <LiveTerminalsRoot>
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
        status={{
          // 활성 멤버 합산 — runs (필터 통과 + V2 변환된 팀) 의 active 상태 member 수
          agents: runs.reduce(
            (acc, r) => acc + r.members.filter((m) => m.state === 'active').length,
            0,
          ),
          tabsLabel: runs.length > 0 ? `${runs.length} run${runs.length > 1 ? 's' : ''}` : undefined,
        }}
        harnessBanner={
          harnessUpdateAvailable
            ? {
                fromVersion: installedHarnessVersion!,
                toVersion: bundledHarnessVersion!,
                onUpdate: () => {
                  void updateHarness()
                },
                onViewDiff: () => setUpdatePreviewOpen(true),
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
        prefillMembers={wizardPrefill}
      />

      <Onboarding onSampleRun={onOnboardingSampleRun} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={DEFAULT_PALETTE_ITEMS}
        onAction={(action) => {
          setPaletteOpen(false)
          // ── Navigation
          if (action === 'go-workspace' || action === 'view-workspace') {
            setView('workspace')
          } else if (action === 'go-git' || action === 'view-git') {
            setView('git')
          } else if (action === 'go-dashboard' || action === 'view-dashboard') {
            setView('dashboard')
          } else if (action === 'go-teams') {
            setView('workspace')
          } else if (action === 'go-settings' || action === 'open-settings') {
            setView('settings')
          }
          // ── Run actions
          else if (action === 'create-team' || action === 'new-run') {
            onNewRun()
          } else if (action === 'new-workspace') {
            setNewWorkspaceDialog(true)
          } else if (action === 'push') {
            // Open Git view; user reviews changes before pushing.
            setView('git')
          } else if (action === 'diff') {
            setView('git')
          } else if (action === 'harness-update') {
            if (harnessUpdateAvailable) {
              setUpdatePreviewOpen(true)
            } else {
              setToast({ name: '하네스가 이미 최신 버전입니다', count: 0 })
              setTimeout(() => setToast(null), 3000)
            }
          } else if (
            action === 'slash-clear' ||
            action === 'slash-compact' ||
            action === 'slash-cost'
          ) {
            // Slash commands are executed inside an active terminal — surface a
            // breadcrumb toast so the user knows to type it themselves once
            // we don't yet auto-route to a terminal.
            setToast({
              name: `${action.replace('slash-', '/')} — 활성 터미널에 직접 입력하세요`,
              count: 0,
            })
            setTimeout(() => setToast(null), 4000)
          }
          // ── Settings deep-links
          else if (action === 'model') {
            setView('settings')
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent('forge:settings-target', {
                  detail: { section: 'agents' },
                }),
              )
            }, 50)
          } else if (action === 'theme-toggle') {
            setToast({
              name: '테마 토글은 v0.6.0 — 현재 dark only',
              count: 0,
            })
            setTimeout(() => setToast(null), 3000)
          } else if (action === 'keys') {
            // Re-open onboarding step 4 (shortcut tour).
            void window.api?.system?.openExternal(
              'https://github.com/anthropics/forge-studio#shortcuts',
            )
          }
          // ── Recent (best-effort no-op for now — surfaces existing nav)
          else if (action === 'open-active') {
            setView('workspace')
          } else if (action === 'recent-last-run') {
            setView('workspace')
          }
        }}
      />

      <NewWorkspaceDialog />

      {updatePreviewOpen && activeWorkspace && (
        <HarnessUpdatePreview
          workspacePath={activeWorkspace.path}
          fromVersion={installedHarnessVersion ?? undefined}
          toVersion={bundledHarnessVersion ?? undefined}
          applying={harnessUpdating}
          onClose={() => setUpdatePreviewOpen(false)}
          onApply={async () => {
            await updateHarness()
            setUpdatePreviewOpen(false)
          }}
        />
      )}
    </LiveTerminalsRoot>
  )
}
