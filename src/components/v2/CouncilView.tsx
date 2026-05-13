// CouncilView — 토론 (Round-robin debate) 상태 view.
//
// 용어 매핑 (사용자 의도):
//   협의 = 멤버끼리 inbox 메시지 주고받는 거 (모든 팀, DiscussionView 가 처리)
//   토론 = council:true 팀의 Round 1 제안 → Round 2 critique → Round 3 합의
//
// 본 컴포넌트는 동일 inbox 데이터를 Round 단위로 grouping + 멤버별 응답
// 상태 표시. council:true 팀에서만 노출.
//
// Round 추론 (v0.10.x heuristic): forge-team seed 메시지 (`from === "forge-team"`,
// summary === "협의 모드 안내") 후 멤버들이 보낸 메시지의 순서로 Round 1
// (proposal) / Round 2 (critique) / Round 3 (consensus) 분류. 명시적 round
// 라벨링은 v0.11+ 작업 (state.json 의 messages[].round 사용).

import { useCallback, useEffect, useState } from 'react'
import type { TeamMember } from './types'
import { getAgent } from './data'

interface InboxMessage {
  from: string
  text: string
  summary?: string
  timestamp: string
  read?: boolean
}

interface CouncilMessage extends InboxMessage {
  to: string
  /** v0.10.x 휴리스틱 추정 round (1: proposal, 2: critique, 3: consensus). */
  round: 1 | 2 | 3 | 0
}

export interface CouncilViewProps {
  teamId: string
  members: TeamMember[]
}

const ROUND_LABEL: Record<1 | 2 | 3 | 0, string> = {
  0: 'Seed',
  1: 'Round 1 · Proposal',
  2: 'Round 2 · Critique',
  3: 'Round 3 · Consensus',
}

const ROUND_COLOR: Record<1 | 2 | 3 | 0, string> = {
  0: 'var(--text-4)',
  1: 'var(--role-arch)',
  2: 'var(--warning)',
  3: 'var(--success)',
}

export function CouncilView({ teamId, members }: CouncilViewProps) {
  const [messages, setMessages] = useState<CouncilMessage[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const all: Array<CouncilMessage> = []
    for (const m of members) {
      const name = m.name ?? m.agentId
      try {
        const list = (await window.api?.teams?.readInbox?.({ teamId, agentName: name })) as
          | InboxMessage[]
          | undefined
        if (list) {
          for (const msg of list) all.push({ ...msg, to: name, round: 0 })
        }
      } catch {
        // 멤버별 실패는 silent
      }
    }
    all.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    // Round 휴리스틱: forge-team seed 후 멤버 메시지를 sender 별로 묶고
    // 각 sender 의 N 번째 메시지를 Round N 으로 (최대 3).
    const senderCounts = new Map<string, number>()
    for (const msg of all) {
      if (msg.from === 'forge-team') {
        msg.round = 0 // seed
        continue
      }
      const prev = senderCounts.get(msg.from) ?? 0
      const next = Math.min(prev + 1, 3) as 1 | 2 | 3
      msg.round = next
      senderCounts.set(msg.from, next)
    }
    setMessages(all)
    setLoading(false)
  }, [teamId, members])

  useEffect(() => {
    void refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh])

  // Round 별로 group
  const grouped: Record<1 | 2 | 3 | 0, CouncilMessage[]> = { 0: [], 1: [], 2: [], 3: [] }
  for (const m of messages) grouped[m.round].push(m)

  if (loading && messages.length === 0) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: 'var(--text-3)' }}>
        협의 진행 상태 로딩…
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        토론 (Round-robin) · 협의 모드 팀의 round 별 메시지
        {(['1', '2', '3'] as const).map((r) => {
          const round = parseInt(r, 10) as 1 | 2 | 3
          const total = members.length
          const responded = new Set(grouped[round].map((m) => m.from)).size
          return (
            <span key={r} style={{ marginLeft: 10 }}>
              <span style={{ color: ROUND_COLOR[round], fontWeight: 600 }}>R{r}</span>{' '}
              <span style={{ color: 'var(--text-2)' }}>{responded}/{total}</span>
            </span>
          )
        })}
      </div>

      {(['0', '1', '2', '3'] as const).map((r) => {
        const round = parseInt(r, 10) as 1 | 2 | 3 | 0
        const items = grouped[round]
        if (items.length === 0) return null
        return (
          <div key={r}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: ROUND_COLOR[round],
                marginBottom: 6,
                paddingBottom: 4,
                borderBottom: `1px solid ${ROUND_COLOR[round]}33`,
              }}
            >
              {ROUND_LABEL[round]} · {items.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((m, i) => {
                const fromA = getAgent(m.from)
                return (
                  <div
                    key={`${m.timestamp}-${i}`}
                    style={{
                      padding: '8px 10px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--line-1)',
                      borderRadius: 5,
                      fontSize: 11.5,
                      lineHeight: 1.45,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>
                        {fromA.name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-4)' }}>→</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {m.to}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-4)' }}>
                        {new Date(m.timestamp).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.text}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {messages.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-4)', padding: 12, textAlign: 'center' }}>
          아직 토론 메시지가 없습니다. 멤버들이 inbox 로 메시지를 주고받으면 여기 표시됩니다.
        </div>
      )}
    </div>
  )
}
