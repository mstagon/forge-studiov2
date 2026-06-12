import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { Pill } from './primitives'
import { Icon } from './icons'

/**
 * FactoryView — 자율 개발 공장 관제실 (v0.21).
 *
 * Night Shift 큐 상태 + 최신 아침 브리핑 + 최근 Gauntlet 적대 심판 결과를
 * 한 화면에. 읽기 전용 (실행은 forge-team factory run — 장기 프로세스라 CLI/
 * 터미널이 적합). main:factory:status IPC 가 .claude/factory · .claude/gauntlet
 * 를 읽어온다.
 */

type JobStatus = 'pending' | 'running' | 'done' | 'blocked' | 'failed' | 'skipped'

interface Job {
  id: string
  status: JobStatus
  goal?: string
  dependsOn?: string[]
  blockerCount?: number
  note?: string
}

interface FactoryStatus {
  queue: { jobs: Job[] }
  briefing: { name: string; content: string } | null
  gauntlet: Array<{ name: string; range: string; blockerCount: number; consensus: number; solo: number }>
}

const STATUS_COLOR: Record<JobStatus, string> = {
  pending: 'var(--text-3)',
  running: 'var(--accent)',
  done: 'var(--success)',
  blocked: 'var(--warning)',
  failed: 'var(--danger)',
  skipped: 'var(--text-3)',
}

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: '대기',
  running: '실행 중',
  done: '완료',
  blocked: '검토 필요',
  failed: '실패',
  skipped: '건너뜀',
}

const card: CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 10,
  padding: 16,
  marginBottom: 14,
}

export function FactoryView() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const [status, setStatus] = useState<FactoryStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!activeWorkspace?.path) {
      setStatus(null)
      return
    }
    setLoading(true)
    try {
      const api = (window as unknown as { api?: { factory?: { status?: (p: string) => Promise<FactoryStatus> } } }).api
      if (api?.factory?.status) {
        setStatus(await api.factory.status(activeWorkspace.path))
      }
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace])

  useEffect(() => {
    void load()
    // 관제실은 폴링 — factory run 이 큐를 갱신하면 반영 (3s)
    const t = setInterval(() => void load(), 3000)
    return () => clearInterval(t)
  }, [load])

  const jobs = status?.queue.jobs ?? []
  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Icon.Layers size={18} />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
          공장 관제실
        </h2>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          Night Shift 큐 · 아침 브리핑 · Gauntlet 적대 심판
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => void load()}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            background: 'var(--bg-3)',
            color: 'var(--text-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {loading ? '…' : '새로고침'}
        </button>
      </div>

      {!activeWorkspace && (
        <div style={{ ...card, color: 'var(--text-3)', fontSize: 12 }}>
          워크스페이스를 먼저 여세요.
        </div>
      )}

      {activeWorkspace && (
        <>
          {/* 큐 보드 */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                계약 큐 ({jobs.length})
              </span>
              <div style={{ flex: 1 }} />
              {(['running', 'done', 'blocked', 'failed', 'pending', 'skipped'] as JobStatus[])
                .filter((s) => counts[s])
                .map((s) => (
                  <Pill key={s} color={STATUS_COLOR[s]}>
                    {STATUS_LABEL[s]} {counts[s]}
                  </Pill>
                ))}
            </div>
            {jobs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                큐가 비어있습니다. 터미널에서:
                <br />
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                  forge-team factory add --workspace . --id &lt;id&gt; --goal "..." --members "a:task,b:task"
                </code>
                <br />
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                  forge-team factory run --workspace .
                </code>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      background: 'var(--bg-1)',
                      borderRadius: 6,
                      border: '1px solid var(--line-1)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: STATUS_COLOR[j.status],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>
                      {j.id}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.goal}
                      {j.note ? ` — ${j.note}` : ''}
                    </span>
                    {j.dependsOn && j.dependsOn.length > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>← {j.dependsOn.join(', ')}</span>
                    )}
                    {typeof j.blockerCount === 'number' && j.blockerCount > 0 && (
                      <Pill color="var(--danger)">blocker {j.blockerCount}</Pill>
                    )}
                    <span style={{ fontSize: 10, color: STATUS_COLOR[j.status], fontWeight: 600 }}>
                      {STATUS_LABEL[j.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Gauntlet 최근 심판 */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 10 }}>
              최근 Gauntlet 적대 심판
            </div>
            {(status?.gauntlet.length ?? 0) === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                아직 없음 —{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  forge-team gauntlet --workspace . --range HEAD~1..HEAD
                </code>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {status!.gauntlet.map((g) => (
                  <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.range || g.name}
                    </span>
                    {g.blockerCount > 0 ? (
                      <Pill color="var(--danger)">blocker {g.blockerCount}</Pill>
                    ) : (
                      <Pill color="var(--success)">clean</Pill>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      합의 {g.consensus} · 단독 {g.solo}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 아침 브리핑 */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 10 }}>
              아침 브리핑 {status?.briefing ? `— ${status.briefing.name}` : ''}
            </div>
            {status?.briefing ? (
              <pre
                style={{
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: 'var(--text-2)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'var(--font-mono)',
                  margin: 0,
                  maxHeight: 360,
                  overflow: 'auto',
                }}
              >
                {status.briefing.content}
              </pre>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                아직 없음 — factory run 이 끝나면 생성됩니다.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
