// SprintManager — phase 기반 plan.json viewer + executor.
//
// 메인 세션이 `forge-team plan --goal X` 으로 만든 plan.json 을 GUI 에서
// 확인/편집하고, phase 별 spawn 버튼으로 멤버 팀 생성. 진행률 트래킹은
// useAgentTeamStore 의 active teams 기반 — phase 의 모든 멤버가 done 이면
// 사용자가 merge 버튼.
//
// v0.8.0 minimal scope:
//   - plan.json 로드 (붙여넣기 또는 파일 select)
//   - phase 별 카드 + spawn 버튼
//   - 같은 phase 의 멤버는 한 forge-team create 로 (worktree 격리)
//   - 진행률: 멤버 state 기반
// v0.8.1+:
//   - 자동 dependency 분석 (같은 파일 → sequential)
//   - phase 자동 진행 (이전 phase 모두 done 이면 다음 자동 spawn)
//   - 결과 머지 자동

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentTeamStore } from '@/stores/agentTeam'
import type { TeamCreateMember } from '@/types'
import { Icon } from './icons'

interface PlanPhase {
  phase: number
  description: string
  parallel: boolean
  members: TeamCreateMember[]
  dependsOn?: number[]
  council?: boolean
}

interface PlanDocument {
  goal: string
  workspaceId: string
  phases: PlanPhase[]
  notes?: string
}

const SAMPLE_PLAN: PlanDocument = {
  goal: '예제 — 실제 plan 은 forge-team plan --goal "X" 로 생성',
  workspaceId: '',
  phases: [
    { phase: 1, description: '스키마', parallel: false, members: [{ agentId: 'prisma-data', task: '스키마', model: 'gpt-5.5' }] },
    { phase: 2, description: 'API', parallel: false, dependsOn: [1], members: [{ agentId: 'nestjs-backend', task: 'API', model: 'claude-opus-4-7' }] },
    { phase: 3, description: 'UI 병렬', parallel: true, dependsOn: [2], members: [
      { agentId: 'flutter-ui', task: '화면', model: 'claude-opus-4-7' },
      { agentId: 'riverpod-logic', task: '상태관리', model: 'claude-opus-4-7' },
    ]},
  ],
  notes: 'Sprint Manager 사용 예시',
}

export function SprintManager() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const teams = useAgentTeamStore((s) => s.teams)
  const create = useAgentTeamStore((s) => s.create)

  const [planText, setPlanText] = useState(JSON.stringify(SAMPLE_PLAN, null, 2))
  const [error, setError] = useState<string | null>(null)
  const [busyPhase, setBusyPhase] = useState<number | null>(null)
  const [spawnedTeams, setSpawnedTeams] = useState<Record<number, string>>({})
  const [mergedPhases, setMergedPhases] = useState<Set<number>>(new Set())
  const [autoAdvance, setAutoAdvance] = useState(true)

  const plan: PlanDocument | null = useMemo(() => {
    try {
      const parsed = JSON.parse(planText) as PlanDocument
      if (!parsed.phases || !Array.isArray(parsed.phases)) return null
      return parsed
    } catch {
      return null
    }
  }, [planText])

  // Phase 진행률 — 해당 phase 가 spawn 한 팀의 멤버 state 기반
  function phaseProgress(phaseNum: number): { total: number; done: number; running: number } {
    const teamId = spawnedTeams[phaseNum]
    if (!teamId) return { total: 0, done: 0, running: 0 }
    const team = teams.find((t) => t.id === teamId)
    if (!team) return { total: 0, done: 0, running: 0 }
    const total = team.members.length
    const done = team.members.filter((m) => m.status === 'shutdown').length
    const running = team.members.filter((m) => m.status === 'running' || m.status === 'active').length
    return { total, done, running }
  }

  // 단계 머지 + (옵션) 다음 단계 자동 spawn
  const handleMergeAndAdvance = useCallback(
    async (p: PlanPhase) => {
      if (!plan || !activeWorkspace) return
      const teamId = spawnedTeams[p.phase]
      if (!teamId) return
      setBusyPhase(p.phase)
      setError(null)
      try {
        const result = await useAgentTeamStore.getState().merge(teamId)
        if (!result || result.ok === false) {
          setError(`병합 실패: ${result?.error ?? '알 수 없음'}`)
          return
        }
        setMergedPhases((prev) => {
          const next = new Set(prev)
          next.add(p.phase)
          return next
        })
        // 자동 진행: 의존성이 이 phase 만이고 아직 spawn 안 된 다음 단계 자동 시작
        if (autoAdvance) {
          const next = plan.phases.find(
            (q) =>
              !spawnedTeams[q.phase] &&
              q.dependsOn?.includes(p.phase) &&
              (q.dependsOn ?? []).every((d) => mergedPhases.has(d) || d === p.phase),
          )
          if (next) {
            await handleSpawn(next)
          }
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusyPhase(null)
      }
    },
    [plan, activeWorkspace, spawnedTeams, autoAdvance, mergedPhases],
  )

  async function handleSpawn(p: PlanPhase) {
    if (!activeWorkspace) {
      setError('활성 워크스페이스 없음')
      return
    }
    if (!plan) return
    setBusyPhase(p.phase)
    setError(null)
    try {
      const result = await create({
        workspaceId: activeWorkspace.id,
        workspacePath: activeWorkspace.path,
        name: `${plan.goal.slice(0, 24)}-phase${p.phase}`,
        goal: p.description,
        members: p.members,
        worktreeStrategy: 'isolated',
        mergeStrategy: 'squash',
      })
      setSpawnedTeams((prev) => ({ ...prev, [p.phase]: result.teamId }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyPhase(null)
    }
  }

  function handleLoadFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const txt = String(reader.result ?? '')
        setPlanText(txt)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: 24,
        gap: 16,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-1)' }}>작업 계획</h1>
        <span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1 }}>
          단계별 팀 작업 실행 — 큰 작업을 여러 단계로 쪼개고 각 단계마다 멤버 팀 spawn
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
          />
          자동 진행 (단계 머지 후 다음 단계 자동 시작)
        </label>
      </div>

      {/* Plan input */}
      <div
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 8,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>계획 파일 (plan.json)</span>
          <button
            onClick={handleLoadFile}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              background: 'var(--bg-3)',
              border: '1px solid var(--line-2)',
              color: 'var(--text-1)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            파일 열기
          </button>
          <button
            onClick={() => setPlanText(JSON.stringify(SAMPLE_PLAN, null, 2))}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              background: 'var(--bg-3)',
              border: '1px solid var(--line-2)',
              color: 'var(--text-1)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            예제 계획
          </button>
          <span style={{ flex: 1 }} />
          {plan ? (
            <span style={{ fontSize: 11, color: 'var(--success)' }}>
              ✓ 유효 ({plan.phases.length} 단계)
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--danger)' }}>
              계획 형식 오류 — JSON 확인
            </span>
          )}
        </div>
        <textarea
          value={planText}
          onChange={(e) => setPlanText(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 160,
            background: 'var(--bg-1)',
            color: 'var(--text-1)',
            border: '1px solid var(--line-2)',
            borderRadius: 4,
            padding: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            resize: 'vertical',
          }}
        />
      </div>

      {/* Phase cards */}
      {plan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plan.phases.map((p) => {
            const progress = phaseProgress(p.phase)
            const teamId = spawnedTeams[p.phase]
            const dependencyMet = !p.dependsOn?.length || p.dependsOn.every((d) => {
              const dp = phaseProgress(d)
              return dp.total > 0 && dp.done === dp.total
            })
            return (
              <div
                key={p.phase}
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-2)',
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      background: 'var(--accent-dim)',
                      color: 'var(--accent)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {p.phase}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                    {p.description}
                  </span>
                  <span style={{ flex: 1 }} />
                  {p.parallel && (
                    <span style={{ fontSize: 10, color: 'var(--info)', padding: '2px 6px', border: '1px solid var(--line-2)', borderRadius: 3 }}>
                      동시 실행
                    </span>
                  )}
                  {p.council && (
                    <span style={{ fontSize: 10, color: 'var(--warn)', padding: '2px 6px', border: '1px solid var(--warn)', borderRadius: 3 }}>
                      협의
                    </span>
                  )}
                  {p.dependsOn && p.dependsOn.length > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      ← {p.dependsOn.join(', ')} 단계 후
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  {p.members.map((m, idx) => (
                    <div
                      key={`${p.phase}-${m.agentId}-${idx}`}
                      style={{
                        background: 'var(--bg-1)',
                        border: '1px solid var(--line-1)',
                        borderRadius: 6,
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
                          {m.agentId}
                        </span>
                        {m.model && (
                          <span
                            style={{
                              padding: '0 5px',
                              borderRadius: 3,
                              fontSize: 9,
                              fontWeight: 700,
                              border: '1px solid var(--line-2)',
                              color: m.model.toLowerCase().startsWith('gpt') || m.model.toLowerCase().startsWith('o1') ? 'var(--info)' : 'var(--accent)',
                            }}
                          >
                            {m.model.toLowerCase().startsWith('gpt') ? 'GPT' : m.model.toUpperCase().includes('OPUS') ? 'OPUS' : m.model.toUpperCase().includes('SONNET') ? 'SONNET' : 'CLAUDE'}
                          </span>
                        )}
                      </div>
                      {m.task && (
                        <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                          {m.task}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {teamId ? (
                    <span style={{ fontSize: 11, color: mergedPhases.has(p.phase) ? 'var(--success)' : 'var(--text-3)' }}>
                      <Icon.Check size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
                      {mergedPhases.has(p.phase)
                        ? '병합 완료'
                        : `팀 시작됨 — ${progress.running}/${progress.total} 작업 중, ${progress.done} 완료`}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: dependencyMet ? 'var(--text-3)' : 'var(--warn)' }}>
                      {dependencyMet ? '시작 가능' : '이전 단계 완료 대기'}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  {!teamId && (
                    <button
                      disabled={!dependencyMet || busyPhase === p.phase || !plan}
                      onClick={() => void handleSpawn(p)}
                      style={{
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: dependencyMet ? 'var(--accent)' : 'var(--bg-3)',
                        border: '1px solid var(--line-2)',
                        color: 'var(--text-1)',
                        borderRadius: 4,
                        cursor: dependencyMet ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {busyPhase === p.phase ? '시작 중…' : '단계 시작'}
                    </button>
                  )}
                  {teamId && !mergedPhases.has(p.phase) && (
                    <button
                      disabled={busyPhase === p.phase}
                      onClick={() => void handleMergeAndAdvance(p)}
                      title="이 단계의 모든 멤버 작업이 끝났으면 머지 후 다음 단계 자동 시작 (자동 진행 켜진 경우)"
                      style={{
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: 'var(--success)',
                        border: '1px solid var(--line-2)',
                        color: 'var(--bg-1)',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      {busyPhase === p.phase ? '머지 중…' : '단계 완료 + 머지'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  )
}
