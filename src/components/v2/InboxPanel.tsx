// InboxPanel — 팀 멤버의 inbox 메시지 list + send box.
//
// 백엔드 (TeamOperations.sendInboxMessage / readInbox / markInboxRead) 가
// `<teamDir>/inboxes/<member>.json` 에 entry append/read. 멤버 ↔ 멤버 메시지
// 채널 — Council 토론 (v0.7.0+) 도 이 inbox 시스템을 활용.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface InboxMessage {
  from: string
  text: string
  summary?: string
  timestamp: string
  read?: boolean
}

interface MemberRef {
  agentId: string
  name?: string
}

export interface InboxPanelProps {
  teamId: string
  /** Inbox 주인 — 이 멤버의 inbox 를 보여주고, send 시 from 으로 사용. */
  agentName: string
  /** Send 시 to 후보로 표시할 다른 멤버들 (자기 자신 제외). */
  otherMembers: MemberRef[]
  onClose: () => void
}

export function InboxPanel({ teamId, agentName, otherMembers, onClose }: InboxPanelProps) {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draftTo, setDraftTo] = useState<string>(otherMembers[0]?.name ?? otherMembers[0]?.agentId ?? '')
  const [draftText, setDraftText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = (await window.api?.teams?.readInbox?.({ teamId, agentName })) as InboxMessage[] | undefined
      setMessages(list ?? [])
      // Open == read. The watcher's unreadCount picks this up next refresh tick.
      await window.api?.teams?.markInboxRead?.({ teamId, agentName })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [teamId, agentName])

  useEffect(() => {
    void refresh()
    // Light polling — chokidar already pushes teams:update on inbox writes,
    // but the subscribe stream doesn't carry inbox payload. 2s poll keeps
    // the panel responsive without overloading.
    const id = window.setInterval(refresh, 2000)
    return () => window.clearInterval(id)
  }, [refresh])

  const candidates = useMemo(
    () => otherMembers.filter((m) => (m.name ?? m.agentId) !== agentName),
    [otherMembers, agentName],
  )

  async function handleSend() {
    if (!draftText.trim() || !draftTo) return
    setSending(true)
    setError(null)
    try {
      const result = await window.api?.teams?.sendMessage?.({
        teamId,
        fromAgent: agentName,
        toAgent: draftTo,
        text: draftText.trim(),
      })
      if (!result?.ok) {
        setError(result?.error ?? '전송 실패')
        return
      }
      setDraftText('')
      // Echo into our own panel as confirmation — backend doesn't deliver to
      // sender's inbox so we add a UI-only optimistic entry.
      setMessages((prev) => [
        {
          from: `${agentName} → ${draftTo}`,
          text: draftText.trim(),
          timestamp: new Date().toISOString(),
          read: true,
        },
        ...prev,
      ])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  function fmtTime(iso: string) {
    try {
      const d = new Date(iso)
      const hh = d.getHours().toString().padStart(2, '0')
      const mm = d.getMinutes().toString().padStart(2, '0')
      return `${hh}:${mm}`
    } catch {
      return iso
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 380,
        height: '100vh',
        background: 'var(--bg-2)',
        borderLeft: '1px solid var(--line-2)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
            Inbox · {agentName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
            팀원 ↔ 팀원 메시지 · `.claude/teams/{teamId}/inboxes/{agentName}.json`
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close inbox"
          style={{
            width: 28,
            height: 28,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          ×
        </button>
      </div>

      {/* Message list (newest first) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {loading && messages.length === 0 ? (
          <div style={{ color: 'var(--text-4)', fontSize: 12, padding: 16, textAlign: 'center' }}>
            불러오는 중…
          </div>
        ) : messages.length === 0 ? (
          <div style={{ color: 'var(--text-4)', fontSize: 12, padding: 16, textAlign: 'center' }}>
            아직 메시지 없음. 아래에서 보내거나 멤버가 보낼 때까지 대기.
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              style={{
                background: m.read ? 'var(--bg-1)' : 'var(--bg-3)',
                border: '1px solid var(--line-1)',
                borderRadius: 6,
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{m.from}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{fmtTime(m.timestamp)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Send box */}
      <div
        style={{
          borderTop: '1px solid var(--line-1)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>To:</span>
          <select
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-1)',
              color: 'var(--text-1)',
              border: '1px solid var(--line-2)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 12,
            }}
          >
            {candidates.length === 0 && <option value="">(다른 멤버 없음)</option>}
            {candidates.map((m) => (
              <option key={m.agentId} value={m.name ?? m.agentId}>
                {m.name ?? m.agentId}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder="메시지 입력 (⌘+Enter 전송)"
          rows={3}
          style={{
            background: 'var(--bg-1)',
            color: 'var(--text-1)',
            border: '1px solid var(--line-2)',
            borderRadius: 4,
            padding: '8px',
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!draftText.trim() || !draftTo || sending}
          style={{
            background: draftText.trim() && draftTo ? 'var(--accent)' : 'var(--bg-3)',
            color: 'var(--text-1)',
            border: '1px solid var(--line-2)',
            borderRadius: 4,
            padding: '6px 12px',
            fontSize: 12,
            cursor: draftText.trim() && draftTo ? 'pointer' : 'not-allowed',
          }}
        >
          {sending ? '전송 중…' : '보내기 (⌘+Enter)'}
        </button>
      </div>
    </div>
  )
}
