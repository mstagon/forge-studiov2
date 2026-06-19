import { useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { Pill } from './primitives'
import { Icon } from './icons'

/**
 * RecorderView — Flight Recorder GUI 스크럽 (v0.23).
 *
 * 팀을 고르면 작업 타임라인(활동 + tmux pane 출력 + inbox + git 커밋)을 단일
 * 시계열로 보여준다. 슬라이더로 시점을 스크럽하면 그 시점까지의 이벤트만
 * 표시 — "그 순간 무슨 일이 있었나" 를 되감아 본다. CLI 의 timeline/fork 를
 * 시각화 (fork 는 CLI: forge-team recorder fork --team-id X --at <sha> --as Y).
 */

interface FlightEvent {
  ts: number
  agent: string
  kind: string
  summary: string
  detail?: Record<string, unknown>
}

interface TeamLite {
  id: string
  name: string
  status?: string
  archivedAt?: string
}

const KIND_COLOR: Record<string, string> = {
  commit: 'var(--success)',
  edit: 'var(--accent)',
  output: 'var(--text-2)',
  inbox: 'var(--role-arch)',
  'state-change': 'var(--warning)',
}
const KIND_LABEL: Record<string, string> = {
  commit: '커밋',
  edit: '편집',
  output: '출력',
  inbox: 'inbox',
  'state-change': '상태',
}

const card: CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 10,
  padding: 16,
  marginBottom: 14,
}

function fmtTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function RecorderView() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const [teams, setTeams] = useState<TeamLite[]>([])
  const [teamId, setTeamId] = useState<string>('')
  const [events, setEvents] = useState<FlightEvent[]>([])
  const [scrub, setScrub] = useState(1) // 0..1, 1=현재
  const [loading, setLoading] = useState(false)

  const api = (window as unknown as {
    api?: {
      recorder?: {
        teams?: (p: string) => Promise<TeamLite[]>
        timeline?: (p: string, t: string, l?: number) => Promise<{ events: FlightEvent[] }>
      }
    }
  }).api

  const loadTeams = useCallback(async () => {
    if (!activeWorkspace?.path || !api?.recorder?.teams) {
      setTeams([])
      return
    }
    const list = await api.recorder.teams(activeWorkspace.path)
    setTeams(list)
    setTeamId((cur) => cur || (list[0]?.id ?? ''))
  }, [activeWorkspace, api])

  const loadTimeline = useCallback(async () => {
    if (!activeWorkspace?.path || !teamId || !api?.recorder?.timeline) {
      setEvents([])
      return
    }
    setLoading(true)
    try {
      const r = await api.recorder.timeline(activeWorkspace.path, teamId, 400)
      setEvents(r.events ?? [])
      setScrub(1)
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, teamId, api])

  useEffect(() => {
    void loadTeams()
  }, [loadTeams])
  useEffect(() => {
    void loadTimeline()
  }, [loadTimeline])

  // 스크럽 시점까지의 이벤트만
  const cutoffIdx = Math.max(0, Math.min(events.length, Math.round(scrub * events.length)))
  const shown = useMemo(() => events.slice(0, cutoffIdx), [events, cutoffIdx])
  const cutoffTs = cutoffIdx > 0 ? events[cutoffIdx - 1]?.ts : 0

  const kindCounts = shown.reduce<Record<string, number>>((a, e) => {
    a[e.kind] = (a[e.kind] ?? 0) + 1
    return a
  }, {})

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Icon.Activity size={18} />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
          Flight Recorder
        </h2>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>작업 타임라인 — 활동·출력·inbox·커밋</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => void loadTimeline()}
          style={{ fontSize: 11, padding: '4px 10px', background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--line-2)', borderRadius: 6, cursor: 'pointer' }}
        >
          {loading ? '…' : '새로고침'}
        </button>
      </div>

      {!activeWorkspace && <div style={{ ...card, color: 'var(--text-3)', fontSize: 12 }}>워크스페이스를 먼저 여세요.</div>}

      {activeWorkspace && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>팀</span>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                style={{ flex: 1, background: 'var(--bg-1)', color: 'var(--text-1)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              >
                {teams.length === 0 && <option value="">팀 없음</option>}
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.id}){t.archivedAt ? ' · archived' : ''}
                  </option>
                ))}
              </select>
            </div>

            {events.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>시점 스크럽</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={1 / Math.max(1, events.length)}
                    value={scrub}
                    onChange={(e) => setScrub(parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {cutoffIdx}/{events.length} · {fmtTime(cutoffTs)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(kindCounts).map(([k, n]) => (
                    <Pill key={k} color={KIND_COLOR[k] ?? 'var(--text-3)'}>
                      {KIND_LABEL[k] ?? k} {n}
                    </Pill>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={card}>
            {events.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                타임라인 이벤트 없음. 팀이 작업하면 활동/커밋/inbox 가 쌓입니다.
                <br />
                pane 출력 캡처:{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  forge-team recorder capture --workspace . --team-id {teamId || '<id>'}
                </code>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {shown
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <div
                      key={`${e.ts}-${i}`}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 8px', background: 'var(--bg-1)', borderRadius: 5, fontSize: 12 }}
                    >
                      <span style={{ width: 96, flexShrink: 0, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{fmtTime(e.ts)}</span>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: KIND_COLOR[e.kind] ?? 'var(--text-3)', flexShrink: 0, marginTop: 5 }} />
                      <span style={{ width: 70, flexShrink: 0, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.agent}</span>
                      <span style={{ width: 40, flexShrink: 0, fontSize: 10, color: KIND_COLOR[e.kind] ?? 'var(--text-3)' }}>{KIND_LABEL[e.kind] ?? e.kind}</span>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: e.kind === 'output' ? 'var(--font-mono)' : undefined, fontSize: e.kind === 'output' ? 10.5 : 12 }}>
                        {e.summary}
                        {e.detail?.sha ? <span style={{ color: 'var(--text-3)' }}> {String(e.detail.sha).slice(0, 8)}</span> : null}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
            과거 시점에서 분기(되감아 다시 시도):{' '}
            <code style={{ fontFamily: 'var(--font-mono)' }}>
              forge-team recorder fork --workspace . --team-id {teamId || '<id>'} --at &lt;sha&gt; --as &lt;agent&gt;
            </code>
          </div>
        </>
      )}
    </div>
  )
}
