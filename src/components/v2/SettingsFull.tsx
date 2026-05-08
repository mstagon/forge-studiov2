/**
 * Settings — full implementation, 5 sections.
 *
 *   General      — workspaces, defaults, UI toggles
 *   Harness      — version, telemetry, repo policies
 *   Agents       — pool defaults, concurrency, models per role
 *   Integrations — connections + MCP servers
 *   Account      — profile, plan & usage, API keys
 *
 * Source: /tmp/forge_design/forge/project/src/settings_full.jsx
 */

import { useEffect, useState, type ReactNode } from 'react'
// TODO: foundation import
import { Btn, Pill, Dot, AvatarStack } from './primitives'
import { Icon } from './icons'
import type { WorkspaceSummary } from './types'
import { CodeGraphViz } from './CodeGraphViz'
import { useOnboardingStore } from '@/stores/onboarding'

export interface SettingsFullProps {
  workspaces: WorkspaceSummary[]
  /** The currently active workspace, used for header context where applicable. */
  workspace?: WorkspaceSummary
}

type SectionId = 'general' | 'harness' | 'agents' | 'integrations' | 'account'

interface SectionSpec {
  id: SectionId
  label: string
  icon: (p: { size?: number; style?: React.CSSProperties }) => ReactNode
}

export function SettingsFull({ workspaces, workspace }: SettingsFullProps) {
  const [section, setSection] = useState<SectionId>('general')
  const sections: SectionSpec[] = [
    { id: 'general',      label: 'General',      icon: Icon.Cog },
    { id: 'harness',      label: 'Harness',      icon: Icon.Bolt },
    { id: 'agents',       label: 'Agents',       icon: Icon.Users },
    { id: 'integrations', label: 'Integrations', icon: Icon.Layers },
    { id: 'account',      label: 'Account',      icon: Icon.Lock },
  ]

  return (
    <div
      data-screen-label="Settings"
      style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        background: 'var(--bg-1)',
      }}
    >
      <div
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--line-1)',
          padding: '18px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          className="ns mono"
          style={{
            padding: '0 16px 8px',
            fontSize: 9.5,
            letterSpacing: 1,
            color: 'var(--text-4)',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          Settings
        </div>
        {sections.map((s) => {
          const SIcon = s.icon
          const a = section === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 16px',
                background: a ? 'var(--bg-2)' : 'transparent',
                border: 'none',
                borderLeft: `2px solid ${a ? 'var(--accent)' : 'transparent'}`,
                color: a ? 'var(--text-1)' : 'var(--text-2)',
                fontSize: 12.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <SIcon size={13} style={{ opacity: a ? 1 : 0.7 }} />
              {s.label}
            </button>
          )
        })}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
        {section === 'general' && (
          <SettingsGeneral workspaces={workspaces} workspace={workspace} />
        )}
        {section === 'harness' && <SettingsHarness workspace={workspace} />}
        {section === 'agents' && <SettingsAgents />}
        {section === 'integrations' && <SettingsIntegrations />}
        {section === 'account' && <SettingsAccount />}
      </div>
    </div>
  )
}

// ─── shared bits ──────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: 'var(--text-1)',
          letterSpacing: -0.4,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

interface SettingsCardProps {
  title: string
  right?: ReactNode
  children: ReactNode
}

function SettingsCard({ title, right, children }: SettingsCardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 8,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{title}</div>
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

interface RowProps {
  label: ReactNode
  sub?: ReactNode
  right?: ReactNode
  last?: boolean
}

function Row({ label, sub, right, last }: RowProps) {
  return (
    <div
      style={{
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderBottom: last ? 'none' : '1px solid var(--line-1)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{label}</div>
        {sub && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              marginTop: 2,
              textWrap: 'pretty',
            } as React.CSSProperties}
          >
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  )
}

interface ToggleProps {
  value: boolean
  onChange: (v: boolean) => void
}

function Toggle({ value, onChange }: ToggleProps) {
  return (
    <span
      onClick={() => onChange(!value)}
      style={{
        width: 30,
        height: 16,
        borderRadius: 999,
        flexShrink: 0,
        background: value ? 'var(--success)' : 'var(--bg-1)',
        border: `1px solid ${value ? 'var(--success)' : 'var(--line-2)'}`,
        position: 'relative',
        transition: 'all 120ms',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: value ? 15 : 1,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: value ? '#0b0e13' : 'var(--text-3)',
          transition: 'left 140ms',
        }}
      />
    </span>
  )
}

function Select({ value }: { value: string }) {
  return (
    <div
      style={{
        height: 26,
        padding: '0 8px',
        borderRadius: 5,
        background: 'var(--bg-3)',
        border: '1px solid var(--line-2)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--text-1)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {value} <Icon.ChevronD size={11} style={{ color: 'var(--text-3)' }} />
    </div>
  )
}

// ─── General ──────────────────────────────────────────────────────

interface SettingsGeneralProps {
  workspaces: WorkspaceSummary[]
  workspace?: WorkspaceSummary
}

export function SettingsGeneral({ workspaces }: SettingsGeneralProps) {
  const [autoFocus, setAutoFocus] = useState(true)
  const [confirmDestructive, setConfirmDestructive] = useState(true)
  return (
    <>
      <SectionHeader title="General" sub="기본 워크스페이스, 모델, UI 동작" />
      <SettingsCard
        title="Workspaces"
        right={
          <Btn variant="ghost" icon={<Icon.Plus size={11} />}>
            Add workspace
          </Btn>
        }
      >
        {workspaces.map((w, i) => (
          <div
            key={w.id}
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderBottom:
                i < workspaces.length - 1 ? '1px solid var(--line-1)' : 'none',
            }}
          >
            <Icon.Folder size={14} style={{ color: 'var(--text-3)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>
                {w.name}
              </div>
              <div
                className="mono"
                style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}
              >
                {w.path} · harness {w.harness}
              </div>
            </div>
            {w.current && <Pill color="var(--accent)">CURRENT</Pill>}
            <Btn variant="ghost" icon={<Icon.Cog size={11} />}>
              Configure
            </Btn>
          </div>
        ))}
      </SettingsCard>

      <SettingsCard title="Defaults">
        <Row
          label="Default model"
          sub="새 Run 생성 시 멤버에 적용되는 모델"
          right={<Select value="sonnet-4.5" />}
        />
        <Row
          label="Default effort"
          sub="thinking budget. high는 대형 변경에만 권장"
          right={<Select value="medium" />}
        />
        <Row
          label="Worktree root"
          sub="격리 워크트리가 만들어지는 경로"
          right={
            <code
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-2)',
                background: 'var(--bg-3)',
                padding: '3px 8px',
                borderRadius: 3,
              }}
            >
              ~/.forge/worktrees/
            </code>
          }
        />
        <Row
          label="Max parallel runs"
          sub="동시에 활성화할 수 있는 Run 수 (resource bar 기준)"
          right={<Select value="8" />}
          last
        />
      </SettingsCard>

      <SettingsCard title="UI">
        <Row
          label="Auto focus next blocked agent"
          sub="머지 충돌·승인 대기시 해당 패널로 자동 점프"
          right={<Toggle value={autoFocus} onChange={setAutoFocus} />}
        />
        <Row
          label="Confirm destructive commands"
          sub="rm -rf, migrate reset 등 사용자 확인"
          right={<Toggle value={confirmDestructive} onChange={setConfirmDestructive} />}
        />
        <OnboardingResetRow />
      </SettingsCard>
    </>
  )
}

function OnboardingResetRow() {
  const show = useOnboardingStore((s) => s.show)
  const reset = useOnboardingStore((s) => s.reset)
  const hasOnboarded = useOnboardingStore((s) => s.hasOnboarded)
  return (
    <Row
      label="Show onboarding again"
      sub={
        hasOnboarded
          ? '5단계 첫 실행 가이드를 다시 띄웁니다.'
          : '첫 실행 가이드가 아직 표시되지 않았습니다.'
      }
      right={
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Btn variant="ghost" onClick={() => show()}>
            지금 열기
          </Btn>
          {hasOnboarded && (
            <Btn variant="default" icon={<Icon.Refresh size={11} />} onClick={() => reset()}>
              초기화
            </Btn>
          )}
        </span>
      }
      last
    />
  )
}

// ─── Harness ──────────────────────────────────────────────────────

export interface SettingsHarnessProps {
  workspace?: WorkspaceSummary
}

export function SettingsHarness({ workspace }: SettingsHarnessProps = {}) {
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [telemetry, setTelemetry] = useState(false)
  const [betaChannel, setBetaChannel] = useState(false)
  return (
    <>
      <SectionHeader title="Harness" sub="forge 자체의 업데이트와 정책" />

      <CodeReviewGraphCard workspace={workspace} />

      <SettingsCard title="Version">
        <Row
          label="Current version"
          sub="모든 Run이 이 버전에서 실행됩니다"
          right={
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
              0.3.9
            </span>
          }
        />
        <Row
          label="Update channel"
          sub="stable / beta / nightly"
          right={<Select value="stable" />}
        />
        <Row
          label="Auto-update"
          sub="새 stable 빌드를 자동 적용"
          right={<Toggle value={autoUpdate} onChange={setAutoUpdate} />}
        />
        <Row
          label="Beta channel"
          sub="실험 기능 미리보기 (안정성 보증 없음)"
          right={<Toggle value={betaChannel} onChange={setBetaChannel} />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Telemetry">
        <Row
          label="Send anonymous usage"
          sub="런 통계 + 충돌 리포트. 코드 내용은 전송하지 않음"
          right={<Toggle value={telemetry} onChange={setTelemetry} />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Repository policies">
        <Row
          label="Block force pushes"
          sub="모든 agent가 --force 푸시 차단"
          right={<Toggle value={true} onChange={() => {}} />}
        />
        <Row
          label="Require reviewer"
          sub="머지 게이트에 reviewer agent 의무 통과"
          right={<Toggle value={true} onChange={() => {}} />}
        />
        <Row
          label="Branch prefix"
          sub="새 Run이 만들 브랜치 접두어"
          right={
            <code
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-2)',
                background: 'var(--bg-3)',
                padding: '3px 8px',
                borderRadius: 3,
              }}
            >
              feature/forge-
            </code>
          }
          last
        />
      </SettingsCard>
    </>
  )
}

// ─── Agents ───────────────────────────────────────────────────────

export function SettingsAgents() {
  return (
    <>
      <SectionHeader title="Agents" sub="에이전트 풀 기본값과 동시성" />

      <SettingsCard
        title="Pool defaults"
        right={
          <Btn variant="ghost" onClick={() => {}}>
            Library에서 편집
          </Btn>
        }
      >
        <Row
          label="Default agent set"
          sub="새 Run이 빈 멤버로 시작할 때 추천되는 5명"
          right={
            <AvatarStack
              ids={['flutter-ui', 'nestjs-auth', 'prisma', 'qa-runner', 'reviewer']}
              max={5}
              size={20}
            />
          }
        />
        <Row
          label="Pool size limit"
          sub="머신당 active agent 총합 상한"
          right={<Select value="32" />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Concurrency">
        <Row
          label="Per-Run parallelism"
          sub="한 Run 안에서 동시에 실행되는 agent 수"
          right={<Select value="6" />}
        />
        <Row
          label="Per-machine PTY budget"
          sub="resource bar의 PTY 표시 기준"
          right={<Select value="64" />}
        />
        <Row
          label="Backpressure"
          sub="자원 한도 도달시 동작"
          right={<Select value="queue" />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Models per role">
        {(
          [
            { role: 'Frontend', model: 'sonnet-4.5', count: 1 },
            { role: 'Backend', model: 'sonnet-4.5', count: 1 },
            { role: 'Database', model: 'sonnet-4.5', count: 1 },
            { role: 'Tests', model: 'haiku-4.5', count: 1 },
            { role: 'Review', model: 'opus-4', count: 1 },
            { role: 'Architecture', model: 'opus-4', count: 1 },
          ] as const
        ).map((r, i, arr) => (
          <Row
            key={r.role}
            label={r.role}
            sub={`${r.count} agents`}
            right={<Select value={r.model} />}
            last={i === arr.length - 1}
          />
        ))}
      </SettingsCard>
    </>
  )
}

// ─── Integrations ─────────────────────────────────────────────────

interface IntegrationItem {
  id: string
  name: string
  desc: string
  connected: boolean
  status: string
}

interface McpServerItem {
  name: string
  url: string
  tools: number
  status: 'ok' | 'starting' | 'error'
}

export function SettingsIntegrations() {
  const integrations: IntegrationItem[] = [
    {
      id: 'github',
      name: 'GitHub',
      desc: '리포 연결, PR 자동 생성, 리뷰 코멘트 동기화',
      connected: true,
      status: 'linked as forge-team',
    },
    {
      id: 'linear',
      name: 'Linear',
      desc: 'Run을 Linear 이슈와 연결. 진행 상태 양방향 동기화',
      connected: true,
      status: 'team: forge',
    },
    { id: 'slack', name: 'Slack', desc: 'Run 완료/머지/실패 알림', connected: false, status: '' },
    {
      id: 'figma',
      name: 'Figma',
      desc: '디자인 토큰 → 코드 동기화 (designer agent)',
      connected: false,
      status: '',
    },
    {
      id: 'sentry',
      name: 'Sentry',
      desc: '프로덕션 에러를 Run 컨텍스트에 자동 첨부',
      connected: true,
      status: 'project: forge-app',
    },
    { id: 'vercel', name: 'Vercel', desc: '프리뷰 배포 URL을 Run에 표시', connected: false, status: '' },
  ]
  const mcpServers: McpServerItem[] = [
    { name: 'filesystem', url: 'stdio:///forge-fs', tools: 8, status: 'ok' },
    { name: 'postgres', url: 'stdio:///pg-mcp', tools: 12, status: 'ok' },
    { name: 'playwright', url: 'stdio:///pw-mcp', tools: 6, status: 'starting' },
  ]
  return (
    <>
      <SectionHeader title="Integrations" sub="외부 서비스 연결과 MCP 서버" />

      <SettingsCard
        title="Connections"
        right={
          <Btn variant="ghost" icon={<Icon.Plus size={11} />}>
            Add
          </Btn>
        }
      >
        {integrations.map((it, i) => (
          <div
            key={it.id}
            style={{
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              borderBottom:
                i < integrations.length - 1 ? '1px solid var(--line-1)' : 'none',
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                flexShrink: 0,
                background: 'var(--bg-3)',
                border: '1px solid var(--line-2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-2)',
              }}
            >
              {it.name.slice(0, 2)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
                  {it.name}
                </span>
                {it.connected && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      color: 'var(--success)',
                      fontSize: 11,
                    }}
                  >
                    <Dot color="var(--success)" /> Connected
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-3)',
                  marginTop: 3,
                  textWrap: 'pretty',
                } as React.CSSProperties}
              >
                {it.desc}
              </div>
              {it.status && (
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 4 }}
                >
                  {it.status}
                </div>
              )}
            </div>
            {it.connected ? (
              <Btn variant="ghost">Configure</Btn>
            ) : (
              <Btn variant="primary" icon={<Icon.Plus size={11} />}>
                Connect
              </Btn>
            )}
          </div>
        ))}
      </SettingsCard>

      <SettingsCard
        title="MCP servers"
        right={
          <Btn variant="ghost" icon={<Icon.Plus size={11} />}>
            Add server
          </Btn>
        }
      >
        {mcpServers.map((s, i, arr) => (
          <div
            key={s.name}
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderBottom: i < arr.length - 1 ? '1px solid var(--line-1)' : 'none',
            }}
          >
            <Dot
              color={s.status === 'ok' ? 'var(--success)' : 'var(--warning)'}
              pulse={s.status === 'starting'}
            />
            <span
              className="mono"
              style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}
            >
              {s.name}
            </span>
            <code
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-3)',
                background: 'var(--bg-3)',
                padding: '2px 6px',
                borderRadius: 3,
              }}
            >
              {s.url}
            </code>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
              {s.tools} tools
            </span>
            <Btn variant="ghost" icon={<Icon.More size={11} />}>
              {' '}
            </Btn>
          </div>
        ))}
      </SettingsCard>
    </>
  )
}

// ─── Account ──────────────────────────────────────────────────────

export function SettingsAccount() {
  const apiKeys = [
    { label: 'CI key — github actions', masked: 'fk_••••••••2bx9', lastUsed: '오늘' },
    { label: 'Local CLI', masked: 'fk_••••••••a7c3', lastUsed: '어제' },
  ]
  return (
    <>
      <SectionHeader title="Account" sub="프로파일, 청구, API 키" />

      <SettingsCard title="Profile">
        <Row
          label="이름"
          sub="팀 멤버에게 표시되는 이름"
          right={
            <code className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
              shsh@forge.dev
            </code>
          }
        />
        <Row
          label="머신"
          sub="이 머신은 mac-mini 라벨로 동기화됨"
          right={
            <code className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
              mac-mini
            </code>
          }
          last
        />
      </SettingsCard>

      <SettingsCard title="Plan & usage">
        <Row
          label="Plan"
          sub="Forge Pro · 무제한 정책 (자원 표시는 정직성 위주)"
          right={<Pill color="var(--accent)">PRO</Pill>}
        />
        <Row
          label="이번 달 토큰"
          sub="모든 Run · 14일 평균 4.1M/일"
          right={
            <span
              className="mono tabular"
              style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}
            >
              57.3M
            </span>
          }
        />
        <Row
          label="이번 달 Run 수"
          sub="머지 28 · 폐기 4 · 진행 3"
          right={
            <span
              className="mono tabular"
              style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}
            >
              35
            </span>
          }
          last
        />
      </SettingsCard>

      <SettingsCard
        title="API keys"
        right={
          <Btn variant="ghost" icon={<Icon.Plus size={11} />}>
            Generate
          </Btn>
        }
      >
        {apiKeys.map((k, i, arr) => (
          <Row
            key={k.masked}
            label={k.label}
            sub={`마지막 사용 ${k.lastUsed}`}
            right={
              <code
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-2)',
                  background: 'var(--bg-3)',
                  padding: '3px 8px',
                  borderRadius: 3,
                }}
              >
                {k.masked}
              </code>
            }
            last={i === arr.length - 1}
          />
        ))}
      </SettingsCard>
    </>
  )
}

// ─── Code Review Graph (Harness add-on) ────────────────────────────
//
// Surface for the optional code-review-graph harness module: install / build /
// open visualization. The IPC bridge (window.api.crGraph.*) is being added by
// a peer worker — until it lands the controls degrade to a "not installed"
// state and the buttons no-op with an informational error.
//
// TODO(crGraph-ipc): replace the loose `any` access with a typed import once
// the preload bridge is committed.

interface CrGraphStats {
  nodes: number
  edges: number
  files: number
  languages: number
  lastBuiltAt?: string | null
}

interface CrGraphInstallStatus {
  installed: boolean
  version?: string
}

interface CrGraphApi {
  isInstalled?: () => Promise<CrGraphInstallStatus>
  install?: (mode: 'pipx' | string) => Promise<void>
  build?: (workspacePath: string) => Promise<void>
  stats?: (workspacePath: string) => Promise<CrGraphStats | null>
  vizStart?: (workspacePath: string) => Promise<{ url: string; pid: number | string }>
  vizStop?: (pid: number | string) => Promise<void>
}

function getCrGraphApi(): CrGraphApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.crGraph as CrGraphApi | undefined
}

function formatRelative(iso?: string | null): string {
  if (!iso) return '한 번도 빌드 안 함'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '한 번도 빌드 안 함'
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}초 전`
  const min = Math.round(diffSec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.round(hr / 24)}일 전`
}

interface CodeReviewGraphCardProps {
  workspace?: WorkspaceSummary
}

function CodeReviewGraphCard({ workspace }: CodeReviewGraphCardProps) {
  const [status, setStatus] = useState<CrGraphInstallStatus | null>(null)
  const [stats, setStats] = useState<CrGraphStats | null>(null)
  const [installing, setInstalling] = useState(false)
  const [building, setBuilding] = useState(false)
  const [progressSec, setProgressSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [vizOpen, setVizOpen] = useState(false)

  const api = getCrGraphApi()
  const apiAvailable = Boolean(api?.isInstalled)
  const wsPath = workspace?.path

  // Refresh install/stats whenever the workspace changes.
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!api?.isInstalled) {
        if (!cancelled) {
          setStatus({ installed: false })
          setStats(null)
        }
        return
      }
      try {
        const s = await api.isInstalled()
        if (cancelled) return
        setStatus(s)
        if (s.installed && wsPath && api.stats) {
          const next = await api.stats(wsPath)
          if (!cancelled) setStats(next ?? null)
        } else if (!cancelled) {
          setStats(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [api, wsPath])

  // Drive the "12s" progress counter while a long-running op is in flight.
  useEffect(() => {
    if (!installing && !building) {
      setProgressSec(0)
      return
    }
    setProgressSec(0)
    const start = Date.now()
    const id = window.setInterval(() => {
      setProgressSec(Math.round((Date.now() - start) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [installing, building])

  const installed = status?.installed ?? false
  const busy = installing || building

  async function handleInstall() {
    if (!api?.install) {
      setError(
        'crGraph IPC bridge not available yet. window.api.crGraph.install will be wired by a peer worker.',
      )
      return
    }
    setError(null)
    setInstalling(true)
    try {
      await api.install('pipx')
      if (api.isInstalled) setStatus(await api.isInstalled())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
    }
  }

  async function handleBuild() {
    if (!api?.build || !wsPath) {
      setError('build 호출 불가: 활성 워크스페이스 또는 IPC 미준비')
      return
    }
    setError(null)
    setBuilding(true)
    try {
      await api.build(wsPath)
      if (api.stats) setStats(await api.stats(wsPath))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBuilding(false)
    }
  }

  function handleOpenViz() {
    if (!wsPath) {
      setError('활성 워크스페이스 없음 — 시각화를 열 수 없습니다.')
      return
    }
    setError(null)
    setVizOpen(true)
  }

  // ─── Status badge ───
  let badge: ReactNode
  if (building) {
    badge = <Pill color="var(--warning)">빌드 중</Pill>
  } else if (installing) {
    badge = <Pill color="var(--warning)">설치 중</Pill>
  } else if (!installed) {
    badge = <Pill color="var(--text-3)">설치 안 됨</Pill>
  } else {
    badge = (
      <Pill color="var(--success)">
        설치됨{status?.version ? ` · ${status.version}` : ''}
      </Pill>
    )
  }

  const statCells: Array<{ label: string; value: string | number }> = [
    { label: 'nodes', value: stats?.nodes ?? '—' },
    { label: 'edges', value: stats?.edges ?? '—' },
    { label: 'files', value: stats?.files ?? '—' },
    { label: 'languages', value: stats?.languages ?? '—' },
  ]

  return (
    <>
      <SettingsCard
        title="Code Review Graph"
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {badge}
            {!apiAvailable && (
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-4)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                ipc pending
              </span>
            )}
          </span>
        }
      >
        {/* Description row */}
        <Row
          label="저장소 의존성 + 호출 그래프"
          sub={`마지막 빌드: ${formatRelative(stats?.lastBuiltAt)}${
            busy ? ` · 작업 중… (${progressSec}s)` : ''
          }`}
          right={
            busy ? (
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid var(--line-2)',
                  borderTopColor: 'var(--accent)',
                  display: 'inline-block',
                  animation: 'crg-spin 0.7s linear infinite',
                }}
              >
                <style>{`@keyframes crg-spin { to { transform: rotate(360deg); } }`}</style>
              </span>
            ) : (
              <Icon.Layers size={14} style={{ color: 'var(--text-3)' }} />
            )
          }
        />

        {/* Stats grid (only when installed) */}
        {installed && (
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--line-1)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
            }}
          >
            {statCells.map((c) => (
              <div
                key={c.label}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  background: 'var(--bg-1)',
                  border: '1px solid var(--line-1)',
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 9.5,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    marginBottom: 6,
                  }}
                >
                  {c.label}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--text-1)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: -0.4,
                  }}
                >
                  {c.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--line-1)',
              fontSize: 11.5,
              color: 'var(--danger)',
              background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {!installed && (
            <Btn
              variant="primary"
              icon={<Icon.Plus size={11} />}
              onClick={handleInstall}
              disabled={busy}
            >
              Install via pipx
            </Btn>
          )}
          {installed && (
            <Btn
              variant="default"
              icon={<Icon.Refresh size={11} />}
              onClick={handleBuild}
              disabled={busy || !wsPath}
            >
              Rebuild graph
            </Btn>
          )}
          <Btn
            variant="ghost"
            icon={<Icon.Activity size={11} />}
            onClick={handleOpenViz}
            disabled={busy || !wsPath}
          >
            Open Visualization
          </Btn>
          {!wsPath && (
            <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 'auto' }}>
              활성 워크스페이스를 먼저 선택하세요
            </span>
          )}
        </div>
      </SettingsCard>

      {vizOpen && wsPath && (
        <CodeGraphViz workspacePath={wsPath} onClose={() => setVizOpen(false)} />
      )}
    </>
  )
}
