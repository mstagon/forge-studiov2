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

export interface OnboardingProps {
  /** Open the create-team wizard (used by Step 5's "Sample Run 만들기"). */
  onSampleRun?: () => void
}

export function Onboarding({ onSampleRun }: OnboardingProps) {
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

  const isLast = step === 5
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
          {step === 4 && <Step4HarnessTour />}
          {step === 5 && <Step5FirstTeam onSampleRun={onSampleRun} onClose={finish} />}
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
          Step {step} / 5
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

const STEP_LABELS = ['환영', '의존성', '워크스페이스', '하네스', '첫 팀']

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

// ─── Step 4: harness tour ─────────────────────────────────────────────

function Step4HarnessTour() {
  const sidebarItems: { icon: ReactNode; label: string; desc: string }[] = [
    {
      icon: <Icon.Folder size={14} />,
      label: 'Workspace',
      desc: '터미널 그리드 + Run 카드 + agent 라이브 뷰. 일상적인 작업 공간.',
    },
    {
      icon: <Icon.Git size={14} />,
      label: 'Git',
      desc: '변경/스테이징/커밋/푸시 + 브랜치 + 머지 충돌 뷰.',
    },
    {
      icon: <Icon.Grid size={14} />,
      label: 'Dashboard',
      desc: '실행 중인 Run 요약과 자원 사용량을 한눈에.',
    },
    {
      icon: <Icon.Cog size={14} />,
      label: 'Settings',
      desc: 'workspaces, harness 버전, 통합, MCP 서버, 계정.',
    },
  ]

  const shortcuts: { keys: string; label: string }[] = [
    { keys: '⌘1 / ⌘2 / ⌘3 / ⌘4', label: '뷰 전환 (Workspace/Git/Dashboard/Teams)' },
    { keys: '⌘N', label: '새 워크스페이스' },
    { keys: '⌘T', label: '새 터미널 탭' },
    { keys: '⌘K', label: 'Command Palette' },
    { keys: '⌘,', label: 'Settings' },
    { keys: '⌘⇧.', label: '하네스 파일 토글 (git 패널)' },
    { keys: '⌘⇧H', label: '터미널 split' },
    { keys: 'Esc', label: 'Run / 모달 닫기' },
  ]

  return (
    <>
      <Heading
        title="하네스 둘러보기"
        sub="좌측 사이드바의 다섯 항목과 자주 쓰는 단축키를 미리 봐두세요. 모든 화면은 Command Palette(⌘K)에서도 바로 열 수 있습니다."
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="ns mono"
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--line-1)',
              fontSize: 10.5,
              letterSpacing: 1.2,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            사이드바
          </div>
          {sidebarItems.map((it, i) => (
            <div
              key={it.label}
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                borderBottom:
                  i < sidebarItems.length - 1 ? '1px solid var(--line-1)' : 'none',
              }}
            >
              <span
                style={{
                  color: 'var(--accent)',
                  marginTop: 2,
                  flexShrink: 0,
                }}
              >
                {it.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>
                  {it.label}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text-3)',
                    marginTop: 2,
                    lineHeight: 1.5,
                  }}
                >
                  {it.desc}
                </div>
              </div>
            </div>
          ))}
        </Card>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="ns mono"
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--line-1)',
              fontSize: 10.5,
              letterSpacing: 1.2,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            단축키
          </div>
          {shortcuts.map((it, i) => (
            <div
              key={it.keys}
              style={{
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderBottom: i < shortcuts.length - 1 ? '1px solid var(--line-1)' : 'none',
              }}
            >
              <code
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--text-1)',
                  background: 'var(--bg-3)',
                  border: '1px solid var(--line-2)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  flexShrink: 0,
                }}
              >
                {it.keys}
              </code>
              <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{it.label}</span>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}

// ─── Step 5: first team / sample run ──────────────────────────────────

function Step5FirstTeam({
  onSampleRun,
  onClose,
}: {
  onSampleRun?: () => void
  onClose: () => void
}) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const sampleMembers = useMemo(() => ['flutter-ui', 'nestjs-backend', 'code-reviewer'], [])

  const launch = () => {
    onSampleRun?.()
  }

  return (
    <>
      <Heading
        title="첫 팀을 만들어보세요"
        sub="평소엔 메인 세션이 직접 일하고, 30분+ 독립 작업 병렬·Council 검수·백그라운드 잡일 때만 팀을 띄웁니다. 팀이 어떻게 생겼는지 3명짜리 샘플 위저드로 미리 볼 수 있어요 — 건너뛰어도 됩니다."
      />
      <Card style={{ padding: 18, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--accent-dim)',
              border: '1px solid var(--accent-line)',
              color: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon.Users size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              Sample Run · 3 members
            </div>
            <div
              className="mono"
              style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}
            >
              {sampleMembers.join('  ·  ')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
              팀 위저드가 멤버를 미리 채운 상태로 열립니다. 이름과 목표만 입력하면 격리 워크트리 +
              tmux 세션이 자동 생성됩니다.
            </div>
          </div>
        </div>
        {!activeWorkspace && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 10px',
              background: 'color-mix(in oklab, var(--warning) 8%, transparent)',
              border: '1px solid color-mix(in oklab, var(--warning) 22%, transparent)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text-2)',
            }}
          >
            먼저 워크스페이스를 선택해야 팀을 생성할 수 있습니다 — 이전 단계로 돌아가세요.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Btn
            variant="primary"
            icon={<Icon.Bolt size={11} />}
            onClick={() => {
              launch()
              onClose()
            }}
            disabled={!activeWorkspace}
          >
            Sample Run 만들기
          </Btn>
          <Btn variant="ghost" onClick={onClose}>
            Skip
          </Btn>
        </div>
      </Card>
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--text-4)',
          lineHeight: 1.5,
        }}
      >
        나중에 Settings → General 의 “Show onboarding again” 버튼으로 이 가이드를 다시 열 수 있습니다.
      </div>
    </>
  )
}
