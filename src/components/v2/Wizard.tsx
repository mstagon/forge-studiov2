/**
 * Create-team wizard — modal, 4 steps.
 *
 *   1. 이름 + 목표
 *   2. 멤버 (agent picker, multi-select)
 *   3. 전략 (worktree + merge)
 *   4. 확인 (요약 + start)
 *
 * Source: /tmp/forge_design/forge/project/src/wizard.jsx
 */

import { Fragment, useEffect, useState, type CSSProperties } from 'react'
// TODO: foundation import
import { Btn, AgentBadge, AvatarStack } from './primitives'
import { Icon } from './icons'
// TODO: foundation import — `./data` is the AGENT_POOL seed module from the
// main session's foundation pass. Falls back to LibraryData agents if needed.
import { AGENT_POOL, AGENT_BY_ID } from './data'
import type { Agent } from './types'

export type WorktreeStrategy = 'isolated' | 'shared'
export type MergeStrategy = 'squash' | 'sequential'

export interface WizardResult {
  name: string
  goal: string
  members: string[]
  worktree: WorktreeStrategy
  merge: MergeStrategy
}

export interface WizardProps {
  open: boolean
  onClose: () => void
  onCreate: (result: WizardResult) => void
  /**
   * Prefill the member list when the wizard opens. Callers can use this to
   * seed onboarding-style "Sample Run" flows (3 members already selected) so
   * the user only has to confirm name + goal.
   */
  prefillMembers?: string[]
}

export function Wizard({ open, onClose, onCreate, prefillMembers }: WizardProps) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [worktree, setWorktree] = useState<WorktreeStrategy>('isolated')
  const [merge, setMerge] = useState<MergeStrategy>('squash')

  useEffect(() => {
    if (open) {
      setStep(1)
      setName('')
      setGoal('')
      setSelected(prefillMembers ?? [])
      setWorktree('isolated')
      setMerge('squash')
    }
  }, [open, prefillMembers])

  if (!open) return null

  const canNext =
    (step === 1 && name.trim() && goal.trim()) ||
    (step === 2 && selected.length > 0) ||
    step === 3 ||
    step === 4

  const submit = () => {
    onCreate({ name, goal, members: selected, worktree, merge })
    onClose()
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720,
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-pop)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--line-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'var(--accent-dim)',
              border: '1px solid var(--accent-line)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            <Icon.Users size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>새 팀 만들기</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              여러 agent가 격리된 워크트리에서 병렬로 일합니다
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              background: 'transparent',
              border: '1px solid var(--line-2)',
              color: 'var(--text-3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon.X size={12} />
          </button>
        </div>

        {/* Step rail */}
        <div
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid var(--line-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {['이름 + 목표', '멤버', '전략', '확인'].map((label, i) => {
            const n = i + 1
            const done = step > n
            const current = step === n
            return (
              <Fragment key={n}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    color: current
                      ? 'var(--text-1)'
                      : done
                        ? 'var(--text-2)'
                        : 'var(--text-4)',
                    fontWeight: current ? 600 : 500,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: current
                        ? 'var(--accent)'
                        : done
                          ? 'color-mix(in oklab, var(--success) 22%, var(--bg-3))'
                          : 'var(--bg-3)',
                      border: `1px solid ${
                        current
                          ? 'var(--accent)'
                          : done
                            ? 'var(--success)'
                            : 'var(--line-2)'
                      }`,
                      color: current
                        ? '#0b0e13'
                        : done
                          ? 'var(--success)'
                          : 'var(--text-4)',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {done ? '✓' : n}
                  </span>
                  <span>{label}</span>
                </div>
                {i < 3 && (
                  <div style={{ flex: 1, height: 1, background: 'var(--line-1)' }} />
                )}
              </Fragment>
            )
          })}
        </div>

        {/* Body */}
        <div style={{ padding: 22, minHeight: 320, maxHeight: 480, overflow: 'auto' }}>
          {step === 1 && <Step1 name={name} setName={setName} goal={goal} setGoal={setGoal} />}
          {step === 2 && <Step2 selected={selected} setSelected={setSelected} />}
          {step === 3 && (
            <Step3
              worktree={worktree}
              setWorktree={setWorktree}
              merge={merge}
              setMerge={setMerge}
            />
          )}
          {step === 4 && (
            <Step4
              name={name}
              goal={goal}
              selected={selected}
              worktree={worktree}
              merge={merge}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--line-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-1)',
          }}
        >
          {step > 1 && (
            <Btn
              variant="ghost"
              icon={<Icon.Chevron size={12} style={{ transform: 'rotate(180deg)' }} />}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Btn>
          )}
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Step {step} / 4
          </span>
          {step < 4 ? (
            <Btn
              variant="primary"
              onClick={() => canNext && setStep(step + 1)}
              style={{ opacity: canNext ? 1 : 0.4, pointerEvents: canNext ? 'auto' : 'none' }}
              kbd="↵"
            >
              Next
            </Btn>
          ) : (
            <Btn
              variant="primary"
              icon={<Icon.Bolt size={12} />}
              onClick={submit}
              kbd="⌘↵"
            >
              Start team
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Field helpers ────────────────────────────────────────────────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        className="mono ns"
        style={{
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {children}
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{hint}</div>
      )}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  background: 'var(--bg-1)',
  border: '1px solid var(--line-2)',
  color: 'var(--text-1)',
  fontSize: 13,
  fontFamily: 'var(--font-ui)',
  outline: 'none',
}

// ─── Step 1: name + goal ──────────────────────────────────────────

interface Step1Props {
  name: string
  setName: (s: string) => void
  goal: string
  setGoal: (s: string) => void
}

function Step1({ name, setName, goal, setGoal }: Step1Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <FieldLabel hint="짧고 명확하게. 예: '회원가입 피처 팀'">팀 이름</FieldLabel>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="회원가입 피처 팀"
          style={inputStyle}
        />
      </div>
      <div>
        <FieldLabel hint="자연어 한 줄 — agent가 자동으로 task 분배에 사용합니다">목표</FieldLabel>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="이메일/소셜 로그인 + 온보딩 3단계 + 약관 동의 플로우 구현"
          style={{ ...inputStyle, minHeight: 88, resize: 'vertical', lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {['피처 추가', '리팩토링', '버그 수정', '성능 최적화', '문서 작성', '테스트 보강'].map(
            (t) => (
              <button
                key={t}
                onClick={() => setGoal(t)}
                style={{
                  height: 22,
                  padding: '0 8px',
                  borderRadius: 4,
                  background: 'var(--bg-3)',
                  border: '1px solid var(--line-2)',
                  color: 'var(--text-2)',
                  fontSize: 11,
                }}
              >
                {t}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: members ──────────────────────────────────────────────

interface Step2Props {
  selected: string[]
  setSelected: React.Dispatch<React.SetStateAction<string[]>>
}

function Step2({ selected, setSelected }: Step2Props) {
  const [filter, setFilter] = useState('')
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const filtered = (AGENT_POOL as Agent[]).filter(
    (a) =>
      !filter ||
      a.name.includes(filter.toLowerCase()) ||
      a.role.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <FieldLabel>멤버 ({selected.length} 선택됨)</FieldLabel>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Icon.Search
            size={12}
            style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-3)' }}
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="필터"
            style={{ ...inputStyle, padding: '6px 8px 6px 26px', width: 180, fontSize: 12 }}
          />
        </div>
      </div>
      {selected.length > 0 && (
        <div
          style={{
            padding: '8px 10px',
            marginBottom: 10,
            background: 'var(--bg-1)',
            border: '1px solid var(--line-1)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {selected.map((id) => {
            const a = (AGENT_BY_ID as Record<string, Agent>)[id]
            if (!a) return null
            return (
              <span
                key={id}
                onClick={() => toggle(id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 4px 3px 4px',
                  borderRadius: 4,
                  background: 'var(--bg-3)',
                  border: '1px solid var(--line-2)',
                  fontSize: 11,
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                <AgentBadge agentId={id} size={16} />
                <span className="mono">{a.name}</span>
                <Icon.X size={10} style={{ color: 'var(--text-3)' }} />
              </span>
            )
          })}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {filtered.map((a) => {
          const on = selected.includes(a.id)
          return (
            <button
              key={a.id}
              onClick={() => toggle(a.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                textAlign: 'left',
                background: on ? 'var(--accent-dim)' : 'var(--bg-3)',
                border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line-2)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <AgentBadge agentId={a.id} size={26} glow={on} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="mono"
                  style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}
                >
                  {a.name}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{a.role}</div>
              </div>
              {on && <Icon.Check size={14} style={{ color: 'var(--accent)' }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 3: strategy ─────────────────────────────────────────────

interface Step3Props {
  worktree: WorktreeStrategy
  setWorktree: (s: WorktreeStrategy) => void
  merge: MergeStrategy
  setMerge: (s: MergeStrategy) => void
}

function Step3({ worktree, setWorktree, merge, setMerge }: Step3Props) {
  const worktreeOptions: {
    id: WorktreeStrategy
    title: string
    desc: string
    detail: string
    icon: React.ReactNode
  }[] = [
    {
      id: 'isolated',
      title: '격리 (권장)',
      desc: 'agent마다 별도 worktree, 충돌 위험 ↓',
      detail: '멤버별 격리 git worktree + tmux 세션 자동 spawn (멤버 ≥ 2명일 때 권장)',
      icon: <Icon.Cube size={16} />,
    },
    {
      id: 'shared',
      title: '공유',
      desc: '같은 디렉터리, 빠르지만 충돌 가능',
      detail: '같은 worktree 공유 (소규모 팀)',
      icon: <Icon.Layers size={16} />,
    },
  ]
  const mergeOptions: {
    id: MergeStrategy
    title: string
    desc: string
    detail: string
  }[] = [
    {
      id: 'squash',
      title: 'Squash',
      desc: '각 agent의 작업을 하나의 커밋으로',
      detail: '한 커밋으로 합침',
    },
    {
      id: 'sequential',
      title: 'Sequential',
      desc: 'agent 순서대로 차례로 머지',
      detail: '멤버 순서대로 머지 (history 보존)',
    },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <FieldLabel hint="격리: 각 agent가 자기 git worktree · 공유: 같은 워크트리에서 동시 편집">
          워크트리 전략
        </FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {worktreeOptions.map((o) => (
            <button
              key={o.id}
              onClick={() => setWorktree(o.id)}
              style={{
                padding: 12,
                borderRadius: 6,
                textAlign: 'left',
                background: worktree === o.id ? 'var(--accent-dim)' : 'var(--bg-3)',
                border: `1px solid ${worktree === o.id ? 'var(--accent-line)' : 'var(--line-2)'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    color: worktree === o.id ? 'var(--accent)' : 'var(--text-2)',
                  }}
                >
                  {o.icon}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  {o.title}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.4 }}>
                {o.desc}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-2)',
                  lineHeight: 1.4,
                  marginTop: 2,
                  paddingTop: 6,
                  borderTop: '1px solid var(--line-1)',
                }}
              >
                {o.detail}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel hint="머지 시점에 적용됩니다">머지 전략</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {mergeOptions.map((o) => (
            <button
              key={o.id}
              onClick={() => setMerge(o.id)}
              style={{
                padding: 10,
                borderRadius: 6,
                textAlign: 'left',
                background: merge === o.id ? 'var(--accent-dim)' : 'var(--bg-3)',
                border: `1px solid ${merge === o.id ? 'var(--accent-line)' : 'var(--line-2)'}`,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  marginBottom: 3,
                }}
              >
                {o.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>
                {o.desc}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-2)',
                  lineHeight: 1.4,
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: '1px solid var(--line-1)',
                }}
              >
                {o.detail}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: confirm ──────────────────────────────────────────────

interface Step4Props {
  name: string
  goal: string
  selected: string[]
  worktree: WorktreeStrategy
  merge: MergeStrategy
}

function Step4({ name, goal, selected, worktree, merge }: Step4Props) {
  // ── Expected-action one-liners (so the user can sanity-check before
  //    Start). Mirrors the strategy details from Step3 but phrased in terms
  //    of *this team's* concrete numbers — e.g. "5 worktrees" not "per-member
  //    worktrees". Sequential / shared get the inverse phrasing.
  const memberCount = selected.length
  const worktreeAction =
    worktree === 'isolated'
      ? `${memberCount}명 분리 worktree + ${memberCount}개 tmux 세션 spawn`
      : `${memberCount}명이 단일 worktree 공유`
  const mergeAction =
    merge === 'squash'
      ? '머지 시 한 커밋으로 합쳐짐'
      : '머지 시 멤버 순서대로 차례로 합쳐짐 (history 보존)'

  const rows: { k: string; v: React.ReactNode; extra?: React.ReactNode }[] = [
    { k: '이름', v: name || '(없음)' },
    { k: '목표', v: goal || '(없음)' },
    {
      k: '멤버',
      v: `${selected.length}명`,
      extra: <AvatarStack ids={selected} max={8} size={20} />,
    },
    {
      k: '워크트리',
      v: worktree === 'isolated' ? '격리' : '공유',
      extra: (
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {worktreeAction}</span>
      ),
    },
    {
      k: '머지',
      v: merge === 'squash' ? 'Squash' : 'Sequential',
      extra: (
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {mergeAction}</span>
      ),
    },
    {
      k: '브랜치',
      v: (
        <span className="mono" style={{ color: 'var(--accent)' }}>
          feature/{(name || 'new').toLowerCase().replace(/\s+/g, '-')}
        </span>
      ),
    },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <FieldLabel>요약</FieldLabel>
        <div
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--line-1)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {rows.map((row, i, arr) => (
            <div
              key={row.k}
              style={{
                display: 'flex',
                padding: '9px 12px',
                gap: 14,
                borderBottom:
                  i < arr.length - 1 ? '1px solid var(--line-1)' : 'none',
                fontSize: 12.5,
              }}
            >
              <div style={{ width: 78, color: 'var(--text-3)', flexShrink: 0 }}>{row.k}</div>
              <div
                style={{
                  flex: 1,
                  color: 'var(--text-1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span>{row.v}</span>
                {row.extra}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          padding: 10,
          borderRadius: 6,
          background: 'color-mix(in oklab, var(--info) 7%, transparent)',
          border: '1px solid color-mix(in oklab, var(--info) 22%, transparent)',
          fontSize: 11.5,
          color: 'var(--text-2)',
          lineHeight: 1.5,
          display: 'flex',
          gap: 8,
        }}
      >
        <Icon.Bolt size={14} style={{ color: 'var(--info)', flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong style={{ color: 'var(--text-1)' }}>Start</strong>를 누르면 {selected.length}개의 git
          worktree가 생성되고, tmux 세션이 그리드로 떠서 각 agent가 작업을 시작합니다.
        </span>
      </div>
    </div>
  )
}
