/**
 * Onboarding — first-run 5-step fullscreen overlay.
 *
 *   1. 환영        — "Forge Studio 가 뭔지" + 스크린샷 placeholder
 *   2. 의존성     — git/tmux/claude-code/code-review-graph 자동 점검
 *   3. 워크스페이스 — 새로 만들기 / 기존 폴더 열기
 *   4. 하네스 소개  — Workspace / Library / Settings 사이드바 + 단축키 카드
 *   5. 첫 팀       — Sample Run 만들기 (3명 멤버 prefill) 또는 Skip
 *
 * Visibility is owned by `useOnboardingStore` — `App.tsx` mounts this
 * component while `visible === true`. The store flips `hasOnboarded` to
 * `true` (persisted) on `finish()`; `Settings → General` exposes a
 * "Show onboarding again" button that calls `reset()` to re-trigger.
 */

import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useOnboardingStore } from '@/stores/onboarding'
import { useWorkspaceStore } from '@/stores/workspace'
import { Btn, Pill } from './primitives'
import { Icon } from './icons'

export function Onboarding() {
  const visible = useOnboardingStore((s) => s.visible)
  const step = useOnboardingStore((s) => s.step)
  const goTo = useOnboardingStore((s) => s.goTo)
  const hide = useOnboardingStore((s) => s.hide)
  const finish = useOnboardingStore((s) => s.finish)

  // Re-run dep check when Step 2 lands so the visible status is fresh
  // (re-running on every step would be wasteful and noisy in the UI).
  const checkDeps = useOnboardingStore((s) => s.checkDeps)
  useEffect(() => {
    if (visible && step === 2) {
      void checkDeps()
    }
  }, [visible, step, checkDeps])

  if (!visible) return null

  const isLast = step === 3
  const next = () => (isLast ? finish() : goTo(step + 1))
  const back = () => goTo(step - 1)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Forge Studio onboarding"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--bg-1)',
        color: 'var(--text-1)',
        fontFamily: 'var(--font-ui)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top progress rail (5 steps) */}
      <ProgressRail step={step} />

      {/* Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '32px 48px 24px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 760 }}>
          {step === 1 && <Step1Welcome />}
          {step === 2 && <Step2Dependencies />}
          {step === 3 && <Step3Workspace />}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--line-1)',
          background: 'var(--bg-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Btn variant="ghost" onClick={hide}>
          Close
        </Btn>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
          Step {step} / 3
        </span>
        {step > 1 && (
          <Btn
            variant="ghost"
            icon={<Icon.Chevron size={12} style={{ transform: 'rotate(180deg)' }} />}
            onClick={back}
          >
            Back
          </Btn>
        )}
        <Btn variant="primary" onClick={next} kbd={isLast ? '⌘↵' : '↵'}>
          {isLast ? 'Finish' : 'Next'}
        </Btn>
      </div>
    </div>
  )
}

// ─── Progress rail ────────────────────────────────────────────────────

const STEP_LABELS = ['환영', '의존성', '워크스페이스']

function ProgressRail({ step }: { step: number }) {
  return (
    <div
      style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--line-1)',
        background: 'var(--bg-2)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent-line)',
          color: 'var(--accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
        }}
      >
        <Icon.Sparkle size={14} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginRight: 16 }}>
        Forge Studio 시작하기
      </div>
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const done = step > n
        const current = step === n
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
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
            <span
              style={{
                fontSize: 11.5,
                color: current
                  ? 'var(--text-1)'
                  : done
                    ? 'var(--text-2)'
                    : 'var(--text-4)',
                fontWeight: current ? 600 : 500,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
            {n < 5 && (
              <div style={{ flex: 1, height: 1, background: 'var(--line-1)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Section helpers ──────────────────────────────────────────────────

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, color: 'var(--text-1)' }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 8,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Step 1: welcome ──────────────────────────────────────────────────

function Step1Welcome() {
  return (
    <>
      <Heading
        title="Forge Studio 에 오신 것을 환영합니다"
        sub="Forge Studio 는 Claude Code 를 IDE 형태로 감싼 데스크톱 앱입니다. 워크스페이스, 실제 터미널, git 패널, 그리고 한 번에 업데이트되는 .claude 하네스를 한 창에 모았습니다. 잠시 5단계에 걸쳐 환경을 준비해드릴게요."
      />
      <div
        style={{
          height: 220,
          borderRadius: 8,
          background:
            'linear-gradient(135deg, var(--bg-2) 0%, var(--bg-3) 60%, var(--accent-dim) 120%)',
          border: '1px solid var(--line-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-3)',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          marginBottom: 16,
        }}
      >
        [ Screenshot placeholder · Workspace shell · sidebar + terminal grid ]
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {[
          { icon: <Icon.Folder size={14} />, t: 'Workspaces', d: '여러 프로젝트를 한 창에서 전환' },
          { icon: <Icon.Terminal size={14} />, t: 'Real terminals', d: 'xterm + node-pty 기반 PTY' },
          { icon: <Icon.Bolt size={14} />, t: 'Harness', d: 'agents/skills/commands 자동 동기화' },
        ].map((it) => (
          <Card key={it.t} style={{ padding: 14 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--accent)',
                marginBottom: 6,
              }}
            >
              {it.icon}
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{it.t}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{it.d}</div>
          </Card>
        ))}
      </div>
    </>
  )
}

// ─── Step 2: dependencies ─────────────────────────────────────────────

function Step2Dependencies() {
  const deps = useOnboardingStore((s) => s.deps)
  const checkingDeps = useOnboardingStore((s) => s.checkingDeps)
  const checkDeps = useOnboardingStore((s) => s.checkDeps)
  const openExternal = (url: string) => {
    void window.api?.system?.openExternal(url)
  }

  return (
    <>
      <Heading
        title="필수 도구 점검"
        sub="이 도구들은 워크스페이스 생성, agent 실행, 시각화에 사용됩니다. 누락된 항목은 Install 버튼을 통해 공식 가이드를 열 수 있습니다."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {deps.map((dep) => {
          const installed = typeof dep.resolved === 'string'
          const checking = dep.resolved === null && checkingDeps
          const bundled = installed && !!dep.bundled
          return (
            <Card
              key={dep.key}
              style={{
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'var(--bg-3)',
                  border: '1px solid var(--line-2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: installed ? 'var(--success)' : 'var(--text-3)',
                  flexShrink: 0,
                }}
              >
                {installed ? <Icon.Check size={14} /> : <Icon.Box size={14} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="mono"
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
                >
                  {dep.label}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {installed ? (
                    <code className="mono" style={{ color: 'var(--text-2)' }}>
                      {dep.resolved}
                    </code>
                  ) : (
                    dep.hint
                  )}
                </div>
              </div>
              {checking ? (
                <Pill color="var(--text-3)">확인 중…</Pill>
              ) : bundled ? (
                // Forge Studio shipped this binary inside the DMG — no user
                // action needed and no install button (since the bundled path
                // is the canonical one we want them to use).
                <Pill color="var(--success)">번들됨</Pill>
              ) : installed ? (
                <Pill color="var(--success)">설치됨</Pill>
              ) : (
                <>
                  <Pill color="var(--warning)">미설치</Pill>
                  <Btn
                    variant="default"
                    icon={<Icon.Arrow size={11} />}
                    onClick={() => openExternal(dep.installUrl)}
                  >
                    Install
                  </Btn>
                </>
              )}
            </Card>
          )
        })}
      </div>
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Btn
          variant="ghost"
          icon={<Icon.Refresh size={11} />}
          onClick={() => {
            void checkDeps()
          }}
        >
          다시 검사
        </Btn>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
          누락된 도구가 있어도 계속 진행할 수 있습니다 — 나중에 Settings 에서 다시 점검하세요.
        </span>
      </div>
    </>
  )
}

// ─── Step 3: first workspace ──────────────────────────────────────────

function Step3Workspace() {
  const setNewWorkspaceDialog = useWorkspaceStore((s) => s.setNewWorkspaceDialog)
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)

  const onOpenExisting = async () => {
    if (!window.api?.system?.showOpenDialog) return
    const result = await window.api.system.showOpenDialog({
      title: '기존 폴더 열기',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return
    try {
      await openWorkspace(result.filePaths[0])
    } catch (err) {
      console.error('[onboarding] openWorkspace failed:', err)
    }
  }

  return (
    <>
      <Heading
        title="첫 워크스페이스를 준비하세요"
        sub="Forge Studio 는 폴더당 하나의 워크스페이스를 갖습니다. 기존 프로젝트 폴더를 그대로 가져오거나, 새로 만들면서 .claude 하네스 템플릿을 자동 적용할 수 있습니다."
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card style={{ padding: 18 }}>
          <Icon.Plus size={18} style={{ color: 'var(--accent)', marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
            새 워크스페이스 만들기
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 12 }}>
            새 폴더에 .claude 하네스를 자동 적용합니다. 새 프로젝트나 빈 디렉터리에 권장.
          </div>
          <Btn
            variant="primary"
            icon={<Icon.Plus size={11} />}
            onClick={() => setNewWorkspaceDialog(true)}
          >
            만들기
          </Btn>
        </Card>
        <Card style={{ padding: 18 }}>
          <Icon.Folder size={18} style={{ color: 'var(--text-2)', marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
            기존 폴더 열기
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 12 }}>
            이미 작업 중인 git 저장소를 그대로 등록합니다. 하네스는 별도로 적용할 수 있습니다.
          </div>
          <Btn variant="default" icon={<Icon.Folder size={11} />} onClick={onOpenExisting}>
            폴더 선택
          </Btn>
        </Card>
      </div>
      {workspaces.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'color-mix(in oklab, var(--success) 6%, transparent)',
            border: '1px solid color-mix(in oklab, var(--success) 22%, transparent)',
            borderRadius: 6,
            fontSize: 11.5,
            color: 'var(--text-2)',
          }}
        >
          이미 등록된 워크스페이스가 {workspaces.length}개 있습니다 — 다음 단계로 진행해도 좋습니다.
        </div>
      )}
    </>
  )
}

