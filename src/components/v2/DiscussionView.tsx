// DiscussionView — 팀의 모든 멤버 inbox 통합 view (chronological).
//
// Council 모드에서 멤버끼리 토론한 메시지를 한 화면에서 시간 순으로 본다.
// InboxPanel (단일 멤버) 와 다른 점: 모든 멤버 메시지 통합 + 누가 누구에게
// 보낸 건지 from→to 표시.

import { useCallback, useEffect, useState } from 'react'
import type { TeamMember } from './types'

interface InboxMessage {
  from: string
  text: string
  summary?: string
  timestamp: string
  read?: boolean
}

interface CombinedMessage extends InboxMessage {
  /** 이 메시지를 받는 멤버 (inbox 주인). */
  to: string
}

export interface DiscussionViewProps {
  teamId: string
  members: TeamMember[]
}

export function DiscussionView({ teamId, members }: DiscussionViewProps) {
  const [messages, setMessages] = useState<CombinedMessage[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const all: CombinedMessage[] = []
    for (const m of members) {
      const name = m.name ?? m.agentId
      try {
        const list = (await window.api?.teams?.readInbox?.({ teamId, agentName: name })) as
          | InboxMessage[]
          | undefined
        if (list) {
          for (const msg of list) all.push({ ...msg, to: name })
        }
      } catch {
        // 멤버별 실패는 silent — 다른 멤버는 계속
      }
    }
    // chronological — 오래된 → 최신 (timeline 위→아래)
    all.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    setMessages(all)
    setLoading(false)
  }, [teamId, members])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(refresh, 2000)
    return () => window.clearInterval(id)
  }, [refresh])

  function fmtTime(iso: string) {
    try {
      const d = new Date(iso)
      const hh = d.getHours().toString().padStart(2, '0')
      const mm = d.getMinutes().toString().padStart(2, '0')
      const ss = d.getSeconds().toString().padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    } catch {
      return iso
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        overflowY: 'auto',
        flex: 1,
      }}
    >
      {loading && messages.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-4)', padding: 12, textAlign: 'center' }}>
          멤버 inbox 읽는 중…
        </div>
      ) : messages.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-4)', padding: 12, textAlign: 'center' }}>
          아직 협의 메시지 없음. 멤버 카드의 메일 아이콘으로 보내거나, Council
          모드 팀이면 자동으로 채워집니다.
        </div>
      ) : (
        messages.map((m, i) => (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              background: m.read ? 'var(--bg-1)' : 'var(--bg-3)',
              border: '1px solid var(--line-1)',
              borderRadius: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 10.5 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{m.from}</span>
              <span style={{ color: 'var(--text-4)' }}>→</span>
              <span style={{ color: 'var(--info)', fontWeight: 600 }}>{m.to}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: 'var(--text-4)' }}>{fmtTime(m.timestamp)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {m.text}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
